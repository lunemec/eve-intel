import type { Settings } from "../../types";
import type { DogmaIndex } from "../dogma/index";
import { processPilotEntry } from "./pilotProcessor";
import type {
  CancelCheck,
  DebugLogger,
  ErrorLogger,
  PipelineSignal,
  ProcessPilotFn,
  PilotCardUpdater
} from "./types";

type ProcessPilotFactoryDeps = {
  processPilotEntry: typeof processPilotEntry;
};

const DEFAULT_DEPS: ProcessPilotFactoryDeps = {
  processPilotEntry
};

export function createProcessPilot(
  params: {
    settings: Settings;
    dogmaIndex: DogmaIndex | null;
    signal: PipelineSignal;
    isCancelled: CancelCheck;
    updatePilotCard: PilotCardUpdater;
    logDebug: DebugLogger;
    logError: ErrorLogger;
    topShips: number;
    deepHistoryMaxPages: number;
  },
  deps: ProcessPilotFactoryDeps = DEFAULT_DEPS
): ProcessPilotFn {
  return (entry, characterId, onRetry) =>
    deps.processPilotEntry({
      entry,
      characterId,
      settings: params.settings,
      topShips: params.topShips,
      deepHistoryMaxPages: params.deepHistoryMaxPages,
      signal: params.signal,
      onRetry,
      dogmaIndex: params.dogmaIndex,
      logDebug: params.logDebug,
      isCancelled: params.isCancelled,
      updatePilotCard: params.updatePilotCard,
      logError: params.logError
    });
}
