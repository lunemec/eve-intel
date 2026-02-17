import type { ParsedPilotInput } from "../../types";
import { fetchCharacterPublic, resolveUniverseNames, type CharacterPublic } from "../api/esi";
import {
  fetchCharacterStats,
  fetchLatestKillsPage,
  fetchLatestLossesPage,
  type ZkillCharacterStats,
  type ZkillKillmail
} from "../api/zkill";
import { derivePilotStats } from "../intel";
import type { PilotCard } from "../usePilotIntelPipeline";
import { buildDerivedInferenceKey, isAbortError, mergeKillmailLists, mergePilotStats } from "./pure";
import { buildStageOneRow, buildStageTwoRow } from "./rows";
import { createErrorCard } from "./stateTransitions";
import { resolveNamesSafely } from "./naming";
import { collectStageNameResolutionIds } from "./stages";
import { ensureExplicitShipTypeId, recomputeDerivedInference, type DerivedInference } from "./executors";
import type {
  CancelCheck,
  DebugLogger,
  ErrorLogger,
  PipelineSignal,
  PilotCardUpdater,
  RetryBuilder
} from "./types";
import { PILOT_PROCESS_CONCURRENCY, ZKILL_PAGE_MAX_ROUNDS, ZKILL_PAGE_ROUND_CONCURRENCY } from "./constants";

export type ResolvedPilotTask = {
  entry: ParsedPilotInput;
  characterId: number;
};

type PilotBreadthState = {
  entry: ParsedPilotInput;
  characterId: number;
  character: CharacterPublic;
  stageOneRow: PilotCard;
  historyKills: Map<number, ZkillKillmail>;
  historyLosses: Map<number, ZkillKillmail>;
  exhaustedKills: boolean;
  exhaustedLosses: boolean;
};

type BreadthDeps = {
  fetchCharacterPublic: typeof fetchCharacterPublic;
  fetchCharacterStats: typeof fetchCharacterStats;
  resolveUniverseNames: typeof resolveUniverseNames;
  derivePilotStats: typeof derivePilotStats;
  mergePilotStats: typeof mergePilotStats;
  buildStageOneRow: typeof buildStageOneRow;
  createErrorCard: typeof createErrorCard;
  fetchLatestKillsPage: typeof fetchLatestKillsPage;
  fetchLatestLossesPage: typeof fetchLatestLossesPage;
  mergeKillmailLists: typeof mergeKillmailLists;
  collectStageNameResolutionIds: typeof collectStageNameResolutionIds;
  resolveNamesSafely: typeof resolveNamesSafely;
  buildStageTwoRow: typeof buildStageTwoRow;
  recomputeDerivedInference: typeof recomputeDerivedInference;
  ensureExplicitShipTypeId: typeof ensureExplicitShipTypeId;
  isAbortError: typeof isAbortError;
};

const DEFAULT_DEPS: BreadthDeps = {
  fetchCharacterPublic,
  fetchCharacterStats,
  resolveUniverseNames,
  derivePilotStats,
  mergePilotStats,
  buildStageOneRow,
  createErrorCard,
  fetchLatestKillsPage,
  fetchLatestLossesPage,
  mergeKillmailLists,
  collectStageNameResolutionIds,
  resolveNamesSafely,
  buildStageTwoRow,
  recomputeDerivedInference,
  ensureExplicitShipTypeId,
  isAbortError
};

export async function runBreadthPilotPipeline(
  params: {
    tasks: ResolvedPilotTask[];
    lookbackDays: number;
    topShips: number;
    maxPages?: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
    logDebug: DebugLogger;
    logError: ErrorLogger;
  },
  deps: BreadthDeps = DEFAULT_DEPS
): Promise<void> {
  const maxPages = Math.max(1, Math.floor(params.maxPages ?? ZKILL_PAGE_MAX_ROUNDS));
  const pilots = await hydrateBaseCards(
    {
      tasks: params.tasks,
      signal: params.signal,
      onRetry: params.onRetry,
      isCancelled: params.isCancelled,
      updatePilotCard: params.updatePilotCard,
      logDebug: params.logDebug,
      logError: params.logError
    },
    deps
  );
  if (params.isCancelled() || pilots.length === 0) {
    return;
  }

  await runPagedHistoryRounds(
    {
      pilots,
      lookbackDays: params.lookbackDays,
      topShips: params.topShips,
      maxPages,
      signal: params.signal,
      onRetry: params.onRetry,
      isCancelled: params.isCancelled,
      updatePilotCard: params.updatePilotCard,
      logDebug: params.logDebug
    },
    deps
  );
}

export async function hydrateBaseCards(
  params: {
    tasks: ResolvedPilotTask[];
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
    logDebug: DebugLogger;
    logError: ErrorLogger;
  },
  deps: BreadthDeps = DEFAULT_DEPS
): Promise<PilotBreadthState[]> {
  const states: PilotBreadthState[] = [];
  await runWithConcurrency(params.tasks, Math.max(1, PILOT_PROCESS_CONCURRENCY), async (task) => {
    if (params.isCancelled()) {
      return;
    }
    try {
      const [character, zkillStats] = await Promise.all([
        deps.fetchCharacterPublic(task.characterId, params.signal, params.onRetry("ESI character")),
        deps.fetchCharacterStats(task.characterId, params.signal, params.onRetry("zKill stats"))
      ]);
      if (params.isCancelled()) {
        return;
      }

      const namesById = await resolveCorpAllianceNames(
        character.corporation_id,
        character.alliance_id,
        params.signal,
        params.onRetry,
        deps
      );
      const stats = deps.mergePilotStats({
        derived: deps.derivePilotStats(task.characterId, [], []),
        zkillStats
      });
      const stageOneRow = deps.buildStageOneRow({
        entry: task.entry,
        characterId: task.characterId,
        character,
        namesById,
        stats,
        kills: [],
        losses: [],
        inferenceKills: [],
        inferenceLosses: []
      });

      params.updatePilotCard(task.entry.pilotName, {
        ...stageOneRow,
        fetchPhase: "base"
      });
      states.push({
        entry: task.entry,
        characterId: task.characterId,
        character,
        stageOneRow: { ...stageOneRow, fetchPhase: "base" },
        historyKills: new Map<number, ZkillKillmail>(),
        historyLosses: new Map<number, ZkillKillmail>(),
        exhaustedKills: false,
        exhaustedLosses: false
      });
    } catch (error) {
      if (deps.isAbortError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      params.logError(`Pilot base hydration failed for ${task.entry.pilotName}`, error);
      params.logDebug("Pilot base hydration failed", { pilot: task.entry.pilotName, error: message });
      params.updatePilotCard(
        task.entry.pilotName,
        deps.createErrorCard(task.entry, `Failed to fetch pilot intel: ${message}`)
      );
    }
  });

  return states;
}

export async function runPagedHistoryRounds(
  params: {
    pilots: PilotBreadthState[];
    lookbackDays: number;
    topShips: number;
    maxPages: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
    logDebug: DebugLogger;
  },
  deps: BreadthDeps = DEFAULT_DEPS
): Promise<void> {
  let roundsProcessed = 0;

  for (let page = 1; page <= params.maxPages; page += 1) {
    if (params.isCancelled()) {
      return;
    }
    const active = params.pilots.filter((pilot) => !pilot.exhaustedKills || !pilot.exhaustedLosses);
    if (active.length === 0) {
      break;
    }

    let roundNewRows = 0;
    await runWithConcurrency(active, Math.max(1, ZKILL_PAGE_ROUND_CONCURRENCY), async (pilot) => {
      if (params.isCancelled()) {
        return;
      }
      const [killRows, lossRows] = await Promise.all([
        deps.fetchLatestKillsPage(pilot.characterId, page, params.signal, params.onRetry(`zKill kills page ${page}`)),
        deps.fetchLatestLossesPage(pilot.characterId, page, params.signal, params.onRetry(`zKill losses page ${page}`))
      ]);

      const beforeKills = pilot.historyKills.size;
      const beforeLosses = pilot.historyLosses.size;
      for (const row of killRows) {
        pilot.historyKills.set(row.killmail_id, row);
      }
      for (const row of lossRows) {
        pilot.historyLosses.set(row.killmail_id, row);
      }
      const addedKills = pilot.historyKills.size - beforeKills;
      const addedLosses = pilot.historyLosses.size - beforeLosses;
      roundNewRows += addedKills + addedLosses;

      pilot.exhaustedKills = killRows.length === 0 || addedKills === 0;
      pilot.exhaustedLosses = lossRows.length === 0 || addedLosses === 0;

      params.updatePilotCard(pilot.entry.pilotName, {
        fetchPhase: "history",
        inferenceKills: toSortedRows(pilot.historyKills, deps),
        inferenceLosses: toSortedRows(pilot.historyLosses, deps)
      });
    });

    roundsProcessed += 1;
    if (page === 1) {
      await recomputeForPilots(params, deps, false);
    }

    if (roundNewRows === 0) {
      break;
    }
  }

  if (roundsProcessed === 0 || params.isCancelled()) {
    return;
  }

  if (roundsProcessed > 1) {
    await recomputeForPilots(params, deps, true);
  } else {
    for (const pilot of params.pilots) {
      params.updatePilotCard(pilot.entry.pilotName, { fetchPhase: "ready" });
    }
  }
}

async function recomputeForPilots(
  params: {
    pilots: PilotBreadthState[];
    lookbackDays: number;
    topShips: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
    logDebug: DebugLogger;
  },
  deps: BreadthDeps,
  finalPass: boolean
): Promise<void> {
  await runWithConcurrency(params.pilots, Math.max(1, ZKILL_PAGE_ROUND_CONCURRENCY), async (pilot) => {
    if (params.isCancelled()) {
      return;
    }
    const inferenceKills = toSortedRows(pilot.historyKills, deps);
    const inferenceLosses = toSortedRows(pilot.historyLosses, deps);
    const ids = deps.collectStageNameResolutionIds({
      characterId: pilot.characterId,
      inferenceKills,
      inferenceLosses,
      corporationId: pilot.character.corporation_id,
      allianceId: pilot.character.alliance_id
    });
    const namesById = await deps.resolveNamesSafely({
      ids,
      signal: params.signal,
      onRetry: params.onRetry,
      dogmaIndex: null,
      logDebug: params.logDebug
    });
    const stageTwoRow = deps.buildStageTwoRow({
      stageOne: pilot.stageOneRow,
      character: pilot.character,
      namesById,
      inferenceKills,
      inferenceLosses
    });
    const cacheKey = buildDerivedInferenceKey({
      characterId: pilot.characterId,
      lookbackDays: params.lookbackDays,
      topShips: params.topShips,
      explicitShip: pilot.entry.explicitShip,
      kills: inferenceKills,
      losses: inferenceLosses
    });
    const derived: DerivedInference = await deps.recomputeDerivedInference({
      row: stageTwoRow,
      settings: { lookbackDays: params.lookbackDays },
      namesById,
      cacheKey,
      debugLog: params.logDebug
    });
    await deps.ensureExplicitShipTypeId({
      predictedShips: derived.predictedShips,
      parsedEntry: pilot.entry,
      signal: params.signal,
      onRetry: params.onRetry,
      logDebug: params.logDebug
    });
    params.updatePilotCard(pilot.entry.pilotName, {
      ...stageTwoRow,
      predictedShips: derived.predictedShips,
      fitCandidates: derived.fitCandidates,
      cynoRisk: derived.cynoRisk,
      fetchPhase: finalPass ? "ready" : "history"
    });
  });
}

function toSortedRows(
  items: Map<number, ZkillKillmail>,
  deps: Pick<BreadthDeps, "mergeKillmailLists">
): ZkillKillmail[] {
  return deps.mergeKillmailLists([], [...items.values()]);
}

async function resolveCorpAllianceNames(
  corporationId: number,
  allianceId: number | undefined,
  signal: PipelineSignal,
  onRetry: RetryBuilder,
  deps: Pick<BreadthDeps, "resolveUniverseNames">
): Promise<Map<number, string>> {
  const ids = [corporationId, allianceId].filter((id): id is number => Number.isFinite(id));
  if (ids.length === 0) {
    return new Map<number, string>();
  }
  try {
    return await deps.resolveUniverseNames(ids, signal, onRetry("ESI names"));
  } catch {
    return new Map<number, string>();
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  runItem: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  let index = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await runItem(current);
    }
  });

  await Promise.allSettled(workers);
}
