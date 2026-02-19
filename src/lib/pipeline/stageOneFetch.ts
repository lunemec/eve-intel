import type { Settings, ParsedPilotInput } from "../../types";
import type { DogmaIndex } from "../dogma/index";
import { derivePilotStats } from "../intel";
import { mergePilotStats } from "./pure";
import { fetchPilotInferenceWindow } from "./inferenceWindow";
import { enrichStageOneRow } from "./stageOneEnrichment";
import { loadDerivedInferenceWithCache } from "./derivedInference";
import { ensureExplicitShipTypeId } from "./executors";
import type { CancelCheck, DebugLogger, PipelineSignal, RetryBuilder } from "./types";

type StageOneFetchDeps = {
  fetchPilotInferenceWindow: typeof fetchPilotInferenceWindow;
  derivePilotStats: typeof derivePilotStats;
  mergePilotStats: typeof mergePilotStats;
  enrichStageOneRow: typeof enrichStageOneRow;
  loadDerivedInferenceWithCache: typeof loadDerivedInferenceWithCache;
  ensureExplicitShipTypeId: typeof ensureExplicitShipTypeId;
};

const DEFAULT_DEPS: StageOneFetchDeps = {
  fetchPilotInferenceWindow,
  derivePilotStats,
  mergePilotStats,
  enrichStageOneRow,
  loadDerivedInferenceWithCache,
  ensureExplicitShipTypeId
};

export async function fetchAndPrepareStageOne(
  params: {
    entry: ParsedPilotInput;
    characterId: number;
    settings: Settings;
    topShips: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    dogmaIndex: DogmaIndex | null;
    logDebug: DebugLogger;
    isCancelled?: CancelCheck;
  },
  deps: StageOneFetchDeps = DEFAULT_DEPS
) {
  const {
    character,
    kills,
    losses,
    zkillStats,
    inferenceKills,
    inferenceLosses
  } = await deps.fetchPilotInferenceWindow({
    pilotName: params.entry.pilotName,
    characterId: params.characterId,
    lookbackDays: params.settings.lookbackDays,
    signal: params.signal,
    onRetry: params.onRetry,
    logDebug: params.logDebug
  });
  if (params.isCancelled?.()) {
    return null;
  }

  const stats = deps.mergePilotStats({
    derived: deps.derivePilotStats(params.characterId, kills, losses),
    zkillStats
  });
  const { stageOneRow, namesById: stageOneNames } = await deps.enrichStageOneRow({
    entry: params.entry,
    characterId: params.characterId,
    character,
    stats,
    kills,
    losses,
    inferenceKills,
    inferenceLosses,
    signal: params.signal,
    onRetry: params.onRetry,
    dogmaIndex: params.dogmaIndex,
    logDebug: params.logDebug
  });
  if (params.isCancelled?.()) {
    return null;
  }

  const stageOneDerived = await deps.loadDerivedInferenceWithCache({
    row: stageOneRow,
    settings: params.settings,
    namesById: stageOneNames,
    dogmaIndex: params.dogmaIndex,
    topShips: params.topShips,
    logDebug: params.logDebug
  });
  if (params.isCancelled?.()) {
    return null;
  }
  await deps.ensureExplicitShipTypeId({
    predictedShips: stageOneDerived.predictedShips,
    parsedEntry: params.entry,
    signal: params.signal,
    onRetry: params.onRetry,
    logDebug: params.logDebug
  });
  if (params.isCancelled?.()) {
    return null;
  }

  params.logDebug("Pilot stage 1 ready", {
    pilot: params.entry.pilotName,
    predicted: stageOneDerived.predictedShips.length
  });

  return { character, stageOneRow, stageOneDerived };
}
