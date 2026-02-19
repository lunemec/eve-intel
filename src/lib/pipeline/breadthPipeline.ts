import type { ParsedPilotInput } from "../../types";
import { fetchCharacterPublic, resolveUniverseNames, type CharacterPublic } from "../api/esi";
import type { DogmaIndex } from "../dogma/index";
import {
  fetchCharacterStats,
  fetchLatestKillsPage,
  fetchLatestLossesPage,
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
import {
  buildPilotSnapshotSourceSignature,
  isPilotSnapshotUsable,
  loadPilotSnapshot,
  savePilotSnapshot,
  type SnapshotLoadResult
} from "./snapshotCache";
import type {
  CancelCheck,
  DebugLogger,
  ErrorLogger,
  PipelineSignal,
  PilotCardUpdater,
  RetryBuilder
} from "./types";
import {
  PILOT_PROCESS_CONCURRENCY,
  THREAT_PRIORITY_DANGER_THRESHOLD,
  THREAT_PRIORITY_HIGH_PAGE_WEIGHT,
  THREAT_PRIORITY_NORMAL_PAGE_WEIGHT,
  ZKILL_PAGE_MAX_ROUNDS,
  ZKILL_PAGE_ROUND_CONCURRENCY
} from "./constants";

export type ResolvedPilotTask = {
  entry: ParsedPilotInput;
  characterId: number;
};

type PilotBreadthState = {
  entry: ParsedPilotInput;
  characterId: number;
  character: CharacterPublic;
  stageOneRow: PilotCard;
  danger: number;
  threatTier: "high" | "normal";
  nextKillsPage: number;
  nextLossesPage: number;
  historyKills: Map<number, ZkillKillmail>;
  historyLosses: Map<number, ZkillKillmail>;
  exhaustedKills: boolean;
  exhaustedLosses: boolean;
  lastMaterialSignature: string;
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
  loadPilotSnapshot?: typeof loadPilotSnapshot;
  savePilotSnapshot?: typeof savePilotSnapshot;
  buildPilotSnapshotSourceSignature?: typeof buildPilotSnapshotSourceSignature;
  isPilotSnapshotUsable?: typeof isPilotSnapshotUsable;
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
  loadPilotSnapshot,
  savePilotSnapshot,
  buildPilotSnapshotSourceSignature,
  isPilotSnapshotUsable,
  isAbortError
};

export async function runBreadthPilotPipeline(
  params: {
    tasks: ResolvedPilotTask[];
    lookbackDays: number;
    topShips: number;
    dogmaIndex?: DogmaIndex | null;
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
      lookbackDays: params.lookbackDays,
      topShips: params.topShips,
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
      dogmaIndex: params.dogmaIndex,
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
    lookbackDays: number;
    topShips: number;
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

      let snapshotResult: SnapshotLoadResult | null = null;
      if (deps.loadPilotSnapshot && deps.buildPilotSnapshotSourceSignature && deps.isPilotSnapshotUsable) {
        snapshotResult = await deps.loadPilotSnapshot({
          pilotName: task.entry.pilotName,
          characterId: task.characterId,
          lookbackDays: params.lookbackDays
        });
      }

      let warmInferenceKills: ZkillKillmail[] = [];
      let warmInferenceLosses: ZkillKillmail[] = [];
      let stageOneForPipeline: PilotCard = { ...stageOneRow, fetchPhase: "base" };
      if (
        snapshotResult?.snapshot &&
        deps.buildPilotSnapshotSourceSignature &&
        deps.isPilotSnapshotUsable &&
        deps.isPilotSnapshotUsable(snapshotResult.snapshot, {
          pilotName: task.entry.pilotName,
          characterId: task.characterId,
          lookbackDays: params.lookbackDays,
          sourceSignature: deps.buildPilotSnapshotSourceSignature({
            row: {
              parsedEntry: task.entry,
              inferenceKills: snapshotResult.snapshot.inferenceKills,
              inferenceLosses: snapshotResult.snapshot.inferenceLosses
            },
            lookbackDays: params.lookbackDays,
            topShips: params.topShips
          })
        })
      ) {
        warmInferenceKills = snapshotResult.snapshot.inferenceKills;
        warmInferenceLosses = snapshotResult.snapshot.inferenceLosses;
        stageOneForPipeline = {
          ...stageOneForPipeline,
          ...snapshotResult.snapshot.baseRow,
          inferenceKills: warmInferenceKills,
          inferenceLosses: warmInferenceLosses,
          predictedShips: snapshotResult.snapshot.predictedShips,
          fitCandidates: snapshotResult.snapshot.fitCandidates,
          cynoRisk: snapshotResult.snapshot.cynoRisk,
          fetchPhase: "ready"
        };
        params.updatePilotCard(task.entry.pilotName, {
          ...stageOneForPipeline
        });
      }

      states.push({
        entry: task.entry,
        characterId: task.characterId,
        character,
        stageOneRow: stageOneForPipeline,
        danger: stats.danger,
        threatTier: classifyThreat(stats.danger),
        nextKillsPage: 1,
        nextLossesPage: 1,
        historyKills: new Map<number, ZkillKillmail>(warmInferenceKills.map((row) => [row.killmail_id, row])),
        historyLosses: new Map<number, ZkillKillmail>(warmInferenceLosses.map((row) => [row.killmail_id, row])),
        exhaustedKills: false,
        exhaustedLosses: false,
        lastMaterialSignature: buildPilotMaterialSignature({
          fetchPhase: stageOneForPipeline.fetchPhase ?? "base",
          statsDanger: stageOneForPipeline.stats?.danger,
          inferenceKills: warmInferenceKills,
          inferenceLosses: warmInferenceLosses,
          predictedShips: stageOneForPipeline.predictedShips,
          fitCandidates: stageOneForPipeline.fitCandidates
        })
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
    dogmaIndex?: DogmaIndex | null;
    maxPages: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
    logDebug: DebugLogger;
  },
  deps: BreadthDeps = DEFAULT_DEPS
): Promise<void> {
  for (const pilot of params.pilots) {
    initializePilotSchedulerState(pilot);
  }
  let roundsProcessed = 0;

  while (true) {
    if (params.isCancelled()) {
      return;
    }
    const active = params.pilots.filter((pilot) => hasRemainingPages(pilot, params.maxPages));
    if (active.length === 0) {
      break;
    }

    let roundNewRows = 0;
    const baseBatch = buildRoundBatch(active);
    roundNewRows += await runRoundBatch(baseBatch, params, deps);

    const extraWeight = Math.max(0, THREAT_PRIORITY_HIGH_PAGE_WEIGHT - THREAT_PRIORITY_NORMAL_PAGE_WEIGHT);
    for (let index = 0; index < extraWeight; index += 1) {
      if (params.isCancelled()) {
        return;
      }
      const highThreatBatch = buildRoundBatch(active, "high");
      if (highThreatBatch.length === 0) {
        break;
      }
      roundNewRows += await runRoundBatch(highThreatBatch, params, deps);
    }

    roundsProcessed += 1;
    if (roundsProcessed === 1) {
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
    dogmaIndex?: DogmaIndex | null;
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
      dogmaIndex: params.dogmaIndex ?? null,
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
      dogmaIndex: params.dogmaIndex ?? null,
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
    const patch: Partial<PilotCard> = {
      ...stageTwoRow,
      predictedShips: derived.predictedShips,
      fitCandidates: derived.fitCandidates,
      cynoRisk: derived.cynoRisk,
      fetchPhase: finalPass ? "ready" : "history"
    };

    const nextSignature = buildPilotMaterialSignature({
      fetchPhase: patch.fetchPhase ?? "history",
      statsDanger: patch.stats?.danger,
      inferenceKills: patch.inferenceKills ?? [],
      inferenceLosses: patch.inferenceLosses ?? [],
      predictedShips: patch.predictedShips ?? [],
      fitCandidates: patch.fitCandidates ?? []
    });
    if (pilot.lastMaterialSignature !== nextSignature) {
      params.updatePilotCard(pilot.entry.pilotName, patch);
      pilot.lastMaterialSignature = nextSignature;
    }

    if (deps.savePilotSnapshot && deps.buildPilotSnapshotSourceSignature) {
      await deps.savePilotSnapshot({
        pilotName: pilot.entry.pilotName,
        characterId: pilot.characterId,
        lookbackDays: params.lookbackDays,
        baseRow: {
          status: stageTwoRow.status,
          fetchPhase: finalPass ? "ready" : "history",
          characterId: stageTwoRow.characterId,
          characterName: stageTwoRow.characterName,
          corporationId: stageTwoRow.corporationId,
          corporationName: stageTwoRow.corporationName,
          allianceId: stageTwoRow.allianceId,
          allianceName: stageTwoRow.allianceName,
          securityStatus: stageTwoRow.securityStatus,
          stats: stageTwoRow.stats
        },
        inferenceKills,
        inferenceLosses,
        predictedShips: derived.predictedShips,
        fitCandidates: derived.fitCandidates,
        cynoRisk: derived.cynoRisk,
        sourceSignature: deps.buildPilotSnapshotSourceSignature({
          row: {
            parsedEntry: pilot.entry,
            inferenceKills,
            inferenceLosses
          },
          lookbackDays: params.lookbackDays,
          topShips: params.topShips
        })
      });
    }
  });
}

function toSortedRows(
  items: Map<number, ZkillKillmail>,
  deps: Pick<BreadthDeps, "mergeKillmailLists">
): ZkillKillmail[] {
  return deps.mergeKillmailLists([], [...items.values()]);
}

function classifyThreat(danger?: number): "high" | "normal" {
  const normalizedDanger = Number(danger);
  if (!Number.isFinite(normalizedDanger)) {
    return "normal";
  }
  return normalizedDanger > THREAT_PRIORITY_DANGER_THRESHOLD ? "high" : "normal";
}

function initializePilotSchedulerState(pilot: PilotBreadthState): void {
  if (!Number.isFinite(pilot.danger)) {
    pilot.danger = pilot.stageOneRow.stats?.danger ?? Number.NaN;
  }
  pilot.threatTier = classifyThreat(pilot.danger);
  if (!Number.isFinite(pilot.nextKillsPage) || pilot.nextKillsPage < 1) {
    pilot.nextKillsPage = 1;
  }
  if (!Number.isFinite(pilot.nextLossesPage) || pilot.nextLossesPage < 1) {
    pilot.nextLossesPage = 1;
  }
}

function hasRemainingPages(pilot: PilotBreadthState, maxPages: number): boolean {
  initializePilotSchedulerState(pilot);
  const hasKills = !pilot.exhaustedKills && pilot.nextKillsPage <= maxPages;
  const hasLosses = !pilot.exhaustedLosses && pilot.nextLossesPage <= maxPages;
  return hasKills || hasLosses;
}

function buildRoundBatch(
  pilots: PilotBreadthState[],
  tier: "all" | "high" = "all"
): PilotBreadthState[] {
  return pilots.filter((pilot) => {
    const pilotTier = pilot.threatTier ?? classifyThreat(pilot.danger ?? pilot.stageOneRow.stats?.danger);
    if (tier === "high" && pilotTier !== "high") {
      return false;
    }
    return true;
  });
}

async function runRoundBatch(
  pilots: PilotBreadthState[],
  params: {
    maxPages: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
  },
  deps: Pick<BreadthDeps, "fetchLatestKillsPage" | "fetchLatestLossesPage" | "mergeKillmailLists">
): Promise<number> {
  let roundNewRows = 0;
  await runWithConcurrency(pilots, Math.max(1, ZKILL_PAGE_ROUND_CONCURRENCY), async (pilot) => {
    if (params.isCancelled() || !hasRemainingPages(pilot, params.maxPages)) {
      return;
    }
    const added = await runPilotPageFetch(pilot, params, deps);
    roundNewRows += added;
  });
  return roundNewRows;
}

async function runPilotPageFetch(
  pilot: PilotBreadthState,
  params: {
    maxPages: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    updatePilotCard: PilotCardUpdater;
  },
  deps: Pick<BreadthDeps, "fetchLatestKillsPage" | "fetchLatestLossesPage" | "mergeKillmailLists">
): Promise<number> {
  const killPage = pilot.nextKillsPage;
  const lossPage = pilot.nextLossesPage;
  const shouldFetchKills = !pilot.exhaustedKills && killPage <= params.maxPages;
  const shouldFetchLosses = !pilot.exhaustedLosses && lossPage <= params.maxPages;
  if (!shouldFetchKills && !shouldFetchLosses) {
    return 0;
  }

  const killRows = shouldFetchKills
    ? await deps.fetchLatestKillsPage(
        pilot.characterId,
        killPage,
        params.signal,
        params.onRetry(`zKill kills page ${killPage}`)
      )
    : [];
  const lossRows = shouldFetchLosses
    ? await deps.fetchLatestLossesPage(
        pilot.characterId,
        lossPage,
        params.signal,
        params.onRetry(`zKill losses page ${lossPage}`)
      )
    : [];

  if (shouldFetchKills) {
    pilot.nextKillsPage += 1;
  }
  if (shouldFetchLosses) {
    pilot.nextLossesPage += 1;
  }

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

  if (shouldFetchKills) {
    pilot.exhaustedKills = killRows.length === 0 || addedKills === 0;
  }
  if (shouldFetchLosses) {
    pilot.exhaustedLosses = lossRows.length === 0 || addedLosses === 0;
  }

  const totalAdded = addedKills + addedLosses;
  if (totalAdded > 0) {
    params.updatePilotCard(pilot.entry.pilotName, {
      fetchPhase: "history",
      inferenceKills: toSortedRows(pilot.historyKills, deps),
      inferenceLosses: toSortedRows(pilot.historyLosses, deps)
    });
  }
  return totalAdded;
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

function buildPilotMaterialSignature(params: {
  fetchPhase: string;
  statsDanger: number | undefined;
  inferenceKills: ZkillKillmail[];
  inferenceLosses: ZkillKillmail[];
  predictedShips: PilotCard["predictedShips"];
  fitCandidates: PilotCard["fitCandidates"];
}): string {
  const killHead = params.inferenceKills.slice(0, 6).map((row) => row.killmail_id).join(",");
  const lossHead = params.inferenceLosses.slice(0, 6).map((row) => row.killmail_id).join(",");
  const predictedSig = params.predictedShips
    .slice(0, 5)
    .map((row) => `${row.shipTypeId ?? 0}:${row.probability}`)
    .join(",");
  const fitSig = params.fitCandidates
    .slice(0, 5)
    .map((row) => `${row.shipTypeId}:${row.confidence}`)
    .join(",");
  return [
    params.fetchPhase,
    Number.isFinite(params.statsDanger) ? Number(params.statsDanger).toFixed(1) : "na",
    params.inferenceKills.length,
    params.inferenceLosses.length,
    killHead,
    lossHead,
    predictedSig,
    fitSig
  ].join("|");
}
