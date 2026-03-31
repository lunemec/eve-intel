import type { ParsedPilotInput } from "../../types";
import { fetchCharacterPublic, resolveUniverseNames, type CharacterPublic } from "../api/esi";
import type { DogmaIndex } from "../dogma/index";
import {
  fetchCharacterStats,
  fetchLatestKillsPage,
  fetchLatestLossesPage,
  getZkillRateLimit,
  type ZkillCacheEvent,
  type ZkillKillmail
} from "../api/zkill";
import { setThrottleDebugListener, getThrottleStats } from "../api/zkill/throttle";
import { derivePilotStats } from "../intel";
import type { PilotCard } from "../pilotDomain";
import { HttpError } from "../api/http";
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
  ZKILL_ADAPTIVE_MIN_REMAINING,
  ZKILL_MAX_HISTORY_AGE_DAYS,
  ZKILL_PAGE_MAX_ROUNDS,
  ZKILL_PAGE_ROUND_CONCURRENCY
} from "./constants";

export type ResolvedPilotTask = {
  entry: ParsedPilotInput;
  characterId: number;
  priority?: "selected" | "suggested";
};

type PilotBreadthState = {
  entry: ParsedPilotInput;
  characterId: number;
  priority: "selected" | "suggested";
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
  failed?: boolean;
  lastTopShipsSignature?: string;
  stableRounds: number;
  converged: boolean;
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
  getZkillRateLimit: typeof getZkillRateLimit;
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
  getZkillRateLimit,
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
  // Wire throttle debug events to the pipeline's debug logger.
  // Note: fleet size is set by the caller (usePilotIntelPipelineEffect)
  // since each pilot runs as a separate pipeline with tasks.length=1.
  setThrottleDebugListener((evt) => {
    if (evt.event === "dispatch" || evt.event === "complete" || evt.event === "error") {
      params.logDebug(`Throttle ${evt.event}`, {
        label: evt.label,
        queueDepth: evt.queueDepth,
        running: evt.running,
        ...(evt.waitMs !== undefined ? { waitMs: evt.waitMs } : {}),
        ...(evt.durationMs !== undefined ? { durationMs: evt.durationMs } : {}),
        ...(evt.error ? { error: evt.error } : {})
      });
    }
  });

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

  const throttleStats = getThrottleStats();
  params.logDebug("Pipeline throttle stats", throttleStats);
  setThrottleDebugListener(null);
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
  await runWithPriorityConcurrency(
    params.tasks,
    Math.max(1, PILOT_PROCESS_CONCURRENCY),
    (task) => task.priority,
    async (task) => {
    if (params.isCancelled()) {
      return;
    }
    try {
      const priority = normalizeTaskPriority(task.priority);
      const baseFetchStartedAt = Date.now();
      params.logDebug("Pilot base fetch started", {
        pilot: task.entry.pilotName,
        characterId: task.characterId,
        priority
      });
      const [character, zkillStats] = await Promise.all([
        deps.fetchCharacterPublic(task.characterId, params.signal, params.onRetry("ESI character")),
        deps.fetchCharacterStats(task.characterId, params.signal, params.onRetry("zKill stats"))
      ]);
      params.logDebug("Pilot base fetch completed", {
        pilot: task.entry.pilotName,
        characterId: task.characterId,
        priority,
        durationMs: Date.now() - baseFetchStartedAt,
        hasZkillStats: Boolean(zkillStats)
      });
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
        priority,
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
        failed: false,
        stableRounds: 0,
        converged: false,
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
      params.updatePilotCard(task.entry.pilotName, {
        status: "error",
        fetchPhase: "error",
        error: `Failed to fetch base pilot intel: ${message}`
      });
    }
    }
  );

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

  // Phase 1: first-paint for ALL pilots (round 1)
  {
    if (params.isCancelled()) {
      return;
    }
    const active = params.pilots.filter((pilot) => pilot.failed !== true && hasRemainingPages(pilot, params.maxPages, deps));
    if (active.length > 0) {
      const highThreatPilots = active.filter((pilot) => (pilot.threatTier ?? classifyThreat(pilot.danger)) === "high").length;
      params.logDebug("Pilot page round scheduling", {
        round: 1,
        phase: "first-paint",
        activePilots: active.length,
        highThreatPilots,
        normalThreatPilots: active.length - highThreatPilots,
        plannedHighBonusBatches: 0
      });

      const baseBatch = buildRoundBatch(active);
      await runRoundBatch(baseBatch, params, deps, true);
      roundsProcessed = 1;

      // Update convergence signatures after first data
      for (const pilot of active) {
        updateConvergence(pilot);
      }

      const validPilots = params.pilots.filter((pilot) => pilot.failed !== true);
      const firstPaintRecomputeStartedAt = Date.now();
      params.logDebug("Pilot first-paint recompute started", { round: 1, pilots: validPilots.length });
      await recomputeForPilots({ ...params, pilots: validPilots }, deps, false);
      params.logDebug("Pilot first-paint recompute completed", {
        round: 1,
        pilots: validPilots.length,
        durationMs: Date.now() - firstPaintRecomputeStartedAt
      });
    }
  }

  // Phase 2: deepen SELECTED pilots first (rounds 2+)
  const selectedPilots = params.pilots.filter((p) => p.priority === "selected");
  const suggestedPilots = params.pilots.filter((p) => p.priority === "suggested");

  roundsProcessed = await runDeepeningRounds(selectedPilots, params, deps, roundsProcessed, "selected");
  // Phase 3: deepen SUGGESTED pilots (remaining budget)
  roundsProcessed = await runDeepeningRounds(suggestedPilots, params, deps, roundsProcessed, "suggested");

  if (roundsProcessed === 0 || params.isCancelled()) {
    return;
  }

  const validPilots = params.pilots.filter((pilot) => pilot.failed !== true);
  if (roundsProcessed > 1) {
    await recomputeForPilots({ ...params, pilots: validPilots }, deps, true);
  } else {
    for (const pilot of validPilots) {
      params.updatePilotCard(pilot.entry.pilotName, { fetchPhase: "ready" });
    }
  }
}

async function runDeepeningRounds(
  pilots: PilotBreadthState[],
  params: {
    maxPages: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
    logDebug: DebugLogger;
  },
  deps: Pick<
    BreadthDeps,
    "fetchLatestKillsPage" |
    "fetchLatestLossesPage" |
    "mergeKillmailLists" |
    "createErrorCard" |
    "isAbortError" |
    "getZkillRateLimit"
  >,
  startRound: number,
  phase: "selected" | "suggested"
): Promise<number> {
  let roundsProcessed = startRound;

  while (true) {
    if (params.isCancelled()) {
      return roundsProcessed;
    }
    const active = pilots.filter((pilot) => pilot.failed !== true && hasRemainingPages(pilot, params.maxPages, deps));
    if (active.length === 0) {
      break;
    }

    const round = roundsProcessed + 1;
    const highThreatPilots = active.filter((pilot) => (pilot.threatTier ?? classifyThreat(pilot.danger)) === "high").length;
    const normalThreatPilots = active.length - highThreatPilots;
    const plannedHighBonusBatches = Math.max(0, THREAT_PRIORITY_HIGH_PAGE_WEIGHT - THREAT_PRIORITY_NORMAL_PAGE_WEIGHT);
    params.logDebug("Pilot page round scheduling", {
      round,
      phase: `deepening-${phase}`,
      activePilots: active.length,
      highThreatPilots,
      normalThreatPilots,
      plannedHighBonusBatches
    });

    let roundNewRows = 0;
    const baseBatch = buildRoundBatch(active);
    roundNewRows += await runRoundBatch(baseBatch, params, deps);

    for (let index = 0; index < plannedHighBonusBatches; index += 1) {
      if (params.isCancelled()) {
        return roundsProcessed;
      }
      const highThreatBatch = buildRoundBatch(active, "high");
      if (highThreatBatch.length === 0) {
        break;
      }
      roundNewRows += await runRoundBatch(highThreatBatch, params, deps);
    }

    roundsProcessed = round;

    // Check convergence after each deepening round
    for (const pilot of active) {
      const wasBefore = pilot.converged;
      updateConvergence(pilot);
      if (pilot.converged && !wasBefore) {
        params.logDebug("Pilot converged", {
          pilot: pilot.entry.pilotName,
          stableRounds: pilot.stableRounds,
          historyKills: pilot.historyKills.size,
          historyLosses: pilot.historyLosses.size,
          topShips: pilot.lastTopShipsSignature
        });
      }
    }

    if (roundNewRows === 0) {
      break;
    }
  }

  return roundsProcessed;
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
    try {
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
    } catch (error) {
      if (deps.isAbortError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      pilot.failed = true;
      pilot.exhaustedKills = true;
      pilot.exhaustedLosses = true;
      params.logDebug("Pilot recompute failed", { pilot: pilot.entry.pilotName, error: message });
      params.updatePilotCard(pilot.entry.pilotName, {
        status: "error",
        fetchPhase: "error",
        error: `Failed to recompute pilot intel: ${message}`
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

function computeTopShipsSignature(pilot: PilotBreadthState): string {
  const freq = new Map<number, number>();
  for (const km of pilot.historyKills.values()) {
    for (const atk of km.attackers ?? []) {
      if (atk.ship_type_id && atk.character_id === pilot.characterId) {
        freq.set(atk.ship_type_id, (freq.get(atk.ship_type_id) ?? 0) + 1);
      }
    }
  }
  for (const km of pilot.historyLosses.values()) {
    const shipId = km.victim?.ship_type_id;
    if (shipId) {
      freq.set(shipId, (freq.get(shipId) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => `${id}:${count}`)
    .join(",");
}

const CONVERGENCE_STABLE_ROUNDS = 2;

function updateConvergence(pilot: PilotBreadthState): void {
  const sig = computeTopShipsSignature(pilot);
  if (sig === pilot.lastTopShipsSignature) {
    pilot.stableRounds += 1;
    if (pilot.stableRounds >= CONVERGENCE_STABLE_ROUNDS) {
      pilot.converged = true;
    }
  } else {
    pilot.stableRounds = 0;
    pilot.lastTopShipsSignature = sig;
  }
}

function hasRemainingPages(
  pilot: PilotBreadthState,
  maxPages: number,
  deps: Pick<BreadthDeps, "getZkillRateLimit">
): boolean {
  initializePilotSchedulerState(pilot);

  if (pilot.converged) {
    return false;
  }

  // Adaptive: if we are low on rate limit, stop deep history fetching for more pilots.
  const rateLimit = deps.getZkillRateLimit();
  if (rateLimit.remaining < ZKILL_ADAPTIVE_MIN_REMAINING) {
    return false;
  }

  // Adaptive: if we already have a lot of data, we don't need to go deeper.
  // 100 kills and 100 losses is usually more than enough for a very confident prediction.
  if (pilot.historyKills.size >= 100 && pilot.historyLosses.size >= 100) {
    return false;
  }

  const hasKills = !pilot.exhaustedKills && pilot.nextKillsPage <= maxPages;
  const hasLosses = !pilot.exhaustedLosses && pilot.nextLossesPage <= maxPages;
  return hasKills || hasLosses;
}

function buildRoundBatch(
  pilots: PilotBreadthState[],
  tier: "all" | "high" = "all"
): PilotBreadthState[] {
  return pilots
    .filter((pilot) => {
      const pilotTier = pilot.threatTier ?? classifyThreat(pilot.danger ?? pilot.stageOneRow.stats?.danger);
      if (tier === "high" && pilotTier !== "high") {
        return false;
      }
      return true;
    })
    .sort(comparePilotFetchOrder);
}

function comparePilotFetchOrder(a: PilotBreadthState, b: PilotBreadthState): number {
  const dangerCompare = compareDangerForScheduling(a, b);
  if (dangerCompare !== 0) {
    return dangerCompare;
  }
  const nameCompare = a.entry.pilotName.localeCompare(b.entry.pilotName, undefined, { sensitivity: "base" });
  if (nameCompare !== 0) {
    return nameCompare;
  }
  return a.characterId - b.characterId;
}

function compareDangerForScheduling(a: PilotBreadthState, b: PilotBreadthState): number {
  const aDanger = resolvePilotDangerForScheduling(a);
  const bDanger = resolvePilotDangerForScheduling(b);
  if (Number.isFinite(aDanger) && Number.isFinite(bDanger) && aDanger !== bDanger) {
    return bDanger - aDanger;
  }
  if (Number.isFinite(aDanger) && !Number.isFinite(bDanger)) {
    return -1;
  }
  if (!Number.isFinite(aDanger) && Number.isFinite(bDanger)) {
    return 1;
  }
  return 0;
}

function resolvePilotDangerForScheduling(pilot: PilotBreadthState): number {
  if (Number.isFinite(pilot.danger)) {
    return pilot.danger;
  }
  const fallbackDanger = pilot.stageOneRow.stats?.danger;
  if (Number.isFinite(fallbackDanger)) {
    return Number(fallbackDanger);
  }
  return Number.NEGATIVE_INFINITY;
}

function isLikelyRateLimit(error: unknown): boolean {
  // Electron: HTTP 420 or 429
  if (error instanceof HttpError && (error.status === 420 || error.status === 429)) {
    return true;
  }
  // Browser: zkill strips CORS headers on rate limit → TypeError (network error)
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("rate") || msg.includes("429") || msg.includes("420") || msg.includes("CORS") || msg.includes("ERR_FAILED");
}

async function runRoundBatch(
  pilots: PilotBreadthState[],
  params: {
    maxPages: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
    logDebug: DebugLogger;
  },
  deps: Pick<
    BreadthDeps,
    "fetchLatestKillsPage" |
    "fetchLatestLossesPage" |
    "mergeKillmailLists" |
    "createErrorCard" |
    "isAbortError" |
    "getZkillRateLimit"
  >,
  isFirstPaint = false
): Promise<number> {
  let roundNewRows = 0;
  await runWithPriorityConcurrency(
    pilots,
    Math.max(1, ZKILL_PAGE_ROUND_CONCURRENCY),
    (pilot) => pilot.priority,
    async (pilot) => {
    if (params.isCancelled() || !hasRemainingPages(pilot, params.maxPages, deps)) {
      return;
    }
    try {
      const added = await runPilotPageFetch(pilot, params, deps, isFirstPaint);
      roundNewRows += added;
    } catch (error) {
      if (deps.isAbortError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = isLikelyRateLimit(error);
      pilot.failed = true;
      pilot.exhaustedKills = true;
      pilot.exhaustedLosses = true;
      params.logDebug(isRateLimit ? "Pilot page fetch rate-limited" : "Pilot page fetch failed", {
        pilot: pilot.entry.pilotName,
        characterId: pilot.characterId,
        killPage: pilot.nextKillsPage,
        lossPage: pilot.nextLossesPage,
        historyKills: pilot.historyKills.size,
        historyLosses: pilot.historyLosses.size,
        error: message,
        isRateLimit
      });
      params.updatePilotCard(pilot.entry.pilotName, {
        status: "error",
        fetchPhase: "error",
        error: isRateLimit
          ? `zkill rate limit reached (had ${pilot.historyKills.size} kills, ${pilot.historyLosses.size} losses)`
          : `Failed to fetch pilot history: ${message}`
      });
    }
    }
  );
  return roundNewRows;
}

async function runPilotPageFetch(
  pilot: PilotBreadthState,
  params: {
    maxPages: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    updatePilotCard: PilotCardUpdater;
    logDebug: DebugLogger;
  },
  deps: Pick<BreadthDeps, "fetchLatestKillsPage" | "fetchLatestLossesPage" | "mergeKillmailLists">,
  isFirstPaint = false
): Promise<number> {
  const killPage = pilot.nextKillsPage;
  const lossPage = pilot.nextLossesPage;
  const shouldFetchKills = !pilot.exhaustedKills && killPage <= params.maxPages;
  const shouldFetchLosses = !pilot.exhaustedLosses && lossPage <= params.maxPages;
  if (!shouldFetchKills && !shouldFetchLosses) {
    return 0;
  }

  const pageFetchStartedAt = Date.now();
  params.logDebug("Pilot page fetch started", {
    pilot: pilot.entry.pilotName,
    characterId: pilot.characterId,
    killPage,
    lossPage,
    fetchKills: shouldFetchKills,
    fetchLosses: shouldFetchLosses
  });

  let killRows: ZkillKillmail[] = [];
  let lossRows: ZkillKillmail[] = [];
  let killDurationMs = 0;
  let lossDurationMs = 0;
  let killCacheEvent: ZkillCacheEvent | null = null;
  let lossCacheEvent: ZkillCacheEvent | null = null;

  // First-paint: reduced hydration for fast initial ship prediction.
  // Deepening: full hydration for fit details on early pages, light on later pages.
  // Suggested pilots get half the hydration budget — they need less precision.
  const isSuggested = pilot.priority === "suggested";
  const getTieredMaxHydrate = (page: number) =>
    isFirstPaint
      ? isSuggested ? 8 : 15
      : page <= 2
        ? isSuggested ? 20 : 40
        : 5;

  if (isFirstPaint && shouldFetchKills && shouldFetchLosses) {
    // Parallel fetch on first-paint to halve wall-clock time.
    const killFetchStartedAt = Date.now();
    const lossFetchStartedAt = killFetchStartedAt;
    const [fetchedKills, fetchedLosses] = await Promise.all([
      deps.fetchLatestKillsPage(
        pilot.characterId,
        killPage,
        params.signal,
        params.onRetry(`zKill kills page ${killPage}`),
        {
          onCacheEvent: (event) => { killCacheEvent = event; },
          maxHydrate: getTieredMaxHydrate(killPage)
        }
      ),
      deps.fetchLatestLossesPage(
        pilot.characterId,
        lossPage,
        params.signal,
        params.onRetry(`zKill losses page ${lossPage}`),
        {
          onCacheEvent: (event) => { lossCacheEvent = event; },
          maxHydrate: getTieredMaxHydrate(lossPage)
        }
      )
    ]);
    killRows = fetchedKills;
    lossRows = fetchedLosses;
    killDurationMs = Date.now() - killFetchStartedAt;
    lossDurationMs = Date.now() - lossFetchStartedAt;
  } else {
    // Sequential fetch during deepening to respect rate-limit backpressure.
    if (shouldFetchKills) {
      const killFetchStartedAt = Date.now();
      killRows = await deps.fetchLatestKillsPage(
        pilot.characterId,
        killPage,
        params.signal,
        params.onRetry(`zKill kills page ${killPage}`),
        {
          onCacheEvent: (event) => {
            killCacheEvent = event;
          },
          maxHydrate: getTieredMaxHydrate(killPage)
        }
      );
      killDurationMs = Date.now() - killFetchStartedAt;
    }

    if (shouldFetchLosses) {
      const lossFetchStartedAt = Date.now();
      lossRows = await deps.fetchLatestLossesPage(
        pilot.characterId,
        lossPage,
        params.signal,
        params.onRetry(`zKill losses page ${lossPage}`),
        {
          onCacheEvent: (event) => {
            lossCacheEvent = event;
          },
          maxHydrate: getTieredMaxHydrate(lossPage)
        }
      );
      lossDurationMs = Date.now() - lossFetchStartedAt;
    }
  }

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

  const maxAgeMs = ZKILL_MAX_HISTORY_AGE_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (shouldFetchKills) {
    const oldestKill = killRows[killRows.length - 1];
    const oldestKillAgeMs = oldestKill ? now - Date.parse(oldestKill.killmail_time) : 0;
    pilot.exhaustedKills = killRows.length === 0 || addedKills === 0 || oldestKillAgeMs > maxAgeMs;
  }
  if (shouldFetchLosses) {
    const oldestLoss = lossRows[lossRows.length - 1];
    const oldestLossAgeMs = oldestLoss ? now - Date.parse(oldestLoss.killmail_time) : 0;
    pilot.exhaustedLosses = lossRows.length === 0 || addedLosses === 0 || oldestLossAgeMs > maxAgeMs;
  }

  const totalAdded = addedKills + addedLosses;
  if (totalAdded > 0) {
    params.updatePilotCard(pilot.entry.pilotName, {
      fetchPhase: "history",
      inferenceKills: toSortedRows(pilot.historyKills, deps),
      inferenceLosses: toSortedRows(pilot.historyLosses, deps)
    });
  }

  params.logDebug("Pilot page fetch completed", {
    pilot: pilot.entry.pilotName,
    characterId: pilot.characterId,
    totalDurationMs: Date.now() - pageFetchStartedAt,
    totalAdded,
    historyKills: pilot.historyKills.size,
    historyLosses: pilot.historyLosses.size,
    kills: {
      requested: shouldFetchKills,
      page: killPage,
      rows: killRows.length,
      added: addedKills,
      exhausted: pilot.exhaustedKills,
      durationMs: killDurationMs,
      cacheEvent: killCacheEvent
    },
    losses: {
      requested: shouldFetchLosses,
      page: lossPage,
      rows: lossRows.length,
      added: addedLosses,
      exhausted: pilot.exhaustedLosses,
      durationMs: lossDurationMs,
      cacheEvent: lossCacheEvent
    }
  });

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

async function runWithPriorityConcurrency<T>(
  items: T[],
  concurrency: number,
  getPriority: (item: T) => "selected" | "suggested" | undefined,
  runItem: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const selected: T[] = [];
  const suggested: T[] = [];
  for (const item of items) {
    if (normalizeTaskPriority(getPriority(item)) === "suggested") {
      suggested.push(item);
    } else {
      selected.push(item);
    }
  }

  let selectedIndex = 0;
  let suggestedIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (selectedIndex < selected.length) {
        const current = selected[selectedIndex];
        selectedIndex += 1;
        await runItem(current);
        continue;
      }
      if (suggestedIndex < suggested.length) {
        const current = suggested[suggestedIndex];
        suggestedIndex += 1;
        await runItem(current);
        continue;
      }
      return;
    }
  });

  await Promise.allSettled(workers);
}

function normalizeTaskPriority(priority: "selected" | "suggested" | undefined): "selected" | "suggested" {
  return priority === "suggested" ? "suggested" : "selected";
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
