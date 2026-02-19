import type { ParsedPilotInput, Settings } from "../../types";
import type { DogmaIndex } from "../dogma/index";
import { fetchAndPrepareStageOne } from "./stageOneFetch";
import { fetchAndMergeStageTwoHistory } from "./stageTwo";
import { enrichStageTwoRow } from "./stageTwoEnrichment";
import { loadDerivedInferenceWithCache } from "./derivedInference";
import { ensureExplicitShipTypeId } from "./executors";
import { createErrorCard } from "./stateTransitions";
import { extractErrorMessage, isAbortError } from "./pure";
import type {
  CancelCheck,
  DebugLogger,
  ErrorLogger,
  PipelineSignal,
  PilotCardUpdater,
  RetryBuilder
} from "./types";

type PilotProcessorDeps = {
  fetchAndPrepareStageOne: typeof fetchAndPrepareStageOne;
  fetchAndMergeStageTwoHistory: typeof fetchAndMergeStageTwoHistory;
  enrichStageTwoRow: typeof enrichStageTwoRow;
  loadDerivedInferenceWithCache: typeof loadDerivedInferenceWithCache;
  ensureExplicitShipTypeId: typeof ensureExplicitShipTypeId;
  createErrorCard: typeof createErrorCard;
  extractErrorMessage: typeof extractErrorMessage;
  isAbortError: typeof isAbortError;
};

const DEFAULT_DEPS: PilotProcessorDeps = {
  fetchAndPrepareStageOne,
  fetchAndMergeStageTwoHistory,
  enrichStageTwoRow,
  loadDerivedInferenceWithCache,
  ensureExplicitShipTypeId,
  createErrorCard,
  extractErrorMessage,
  isAbortError
};

export async function processPilotEntry(
  params: {
    entry: ParsedPilotInput;
    characterId: number;
    settings: Settings;
    topShips: number;
    deepHistoryMaxPages: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    dogmaIndex: DogmaIndex | null;
    logDebug: DebugLogger;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
    logError: ErrorLogger;
  },
  deps: PilotProcessorDeps = DEFAULT_DEPS
): Promise<void> {
  try {
    const stageOneResult = await deps.fetchAndPrepareStageOne({
      entry: params.entry,
      characterId: params.characterId,
      settings: params.settings,
      topShips: params.topShips,
      signal: params.signal,
      onRetry: params.onRetry,
      dogmaIndex: params.dogmaIndex,
      logDebug: params.logDebug,
      isCancelled: params.isCancelled
    });
    if (!stageOneResult || params.isCancelled()) {
      return;
    }

    const { character, stageOneRow, stageOneDerived } = stageOneResult;
    params.updatePilotCard(params.entry.pilotName, {
      ...stageOneRow,
      predictedShips: stageOneDerived.predictedShips,
      fitCandidates: stageOneDerived.fitCandidates,
      cynoRisk: stageOneDerived.cynoRisk
    });

    const { mergedInferenceKills, mergedInferenceLosses } = await deps.fetchAndMergeStageTwoHistory({
      pilotName: params.entry.pilotName,
      characterId: params.characterId,
      inferenceKills: stageOneRow.inferenceKills,
      inferenceLosses: stageOneRow.inferenceLosses,
      maxPages: params.deepHistoryMaxPages,
      signal: params.signal,
      onRetry: params.onRetry,
      logDebug: params.logDebug
    });
    if (params.isCancelled()) {
      return;
    }

    const { stageTwoRow, namesById: stageTwoNames } = await deps.enrichStageTwoRow({
      characterId: params.characterId,
      stageOneRow,
      character,
      inferenceKills: mergedInferenceKills,
      inferenceLosses: mergedInferenceLosses,
      signal: params.signal,
      onRetry: params.onRetry,
      dogmaIndex: params.dogmaIndex,
      logDebug: params.logDebug
    });
    const stageTwoDerived = await deps.loadDerivedInferenceWithCache({
      row: stageTwoRow,
      settings: params.settings,
      namesById: stageTwoNames,
      dogmaIndex: params.dogmaIndex,
      topShips: params.topShips,
      logDebug: params.logDebug
    });
    await deps.ensureExplicitShipTypeId({
      predictedShips: stageTwoDerived.predictedShips,
      parsedEntry: params.entry,
      signal: params.signal,
      onRetry: params.onRetry,
      logDebug: params.logDebug
    });
    params.updatePilotCard(params.entry.pilotName, {
      ...stageTwoRow,
      predictedShips: stageTwoDerived.predictedShips,
      fitCandidates: stageTwoDerived.fitCandidates,
      cynoRisk: stageTwoDerived.cynoRisk
    });
    params.logDebug("Pilot stage 2 ready", {
      pilot: params.entry.pilotName,
      predicted: stageTwoDerived.predictedShips.length,
      fits: stageTwoDerived.fitCandidates.length
    });
  } catch (error) {
    if (deps.isAbortError(error)) {
      return;
    }
    const reason = deps.extractErrorMessage(error);
    params.logError(`Pilot intel fetch failed for ${params.entry.pilotName}`, error);
    params.logDebug("Pilot fetch failed", { pilot: params.entry.pilotName, error: reason });
    params.updatePilotCard(
      params.entry.pilotName,
      deps.createErrorCard(params.entry, `Failed to fetch pilot intel: ${reason}`)
    );
  }
}
