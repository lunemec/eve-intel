import type { ParsedPilotInput, Settings } from "../../types";
import type { DogmaIndex } from "../dogma/index";
import { runBreadthPilotPipeline } from "./breadthPipeline";
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
  runBreadthPilotPipeline: typeof runBreadthPilotPipeline;
  createErrorCard: typeof createErrorCard;
  extractErrorMessage: typeof extractErrorMessage;
  isAbortError: typeof isAbortError;
};

const DEFAULT_DEPS: PilotProcessorDeps = {
  runBreadthPilotPipeline,
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
    await deps.runBreadthPilotPipeline({
      tasks: [{ entry: params.entry, characterId: params.characterId }],
      lookbackDays: params.settings.lookbackDays,
      topShips: params.topShips,
      dogmaIndex: params.dogmaIndex,
      maxPages: params.deepHistoryMaxPages,
      signal: params.signal,
      onRetry: params.onRetry,
      isCancelled: params.isCancelled,
      updatePilotCard: params.updatePilotCard,
      logDebug: params.logDebug,
      logError: params.logError
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
