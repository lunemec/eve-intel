import type { ParsedPilotInput } from "../../types";
import type { Dispatch, SetStateAction } from "react";
import { resolveCharacterIds } from "../api/esi";
import { createRetryNoticeHandler } from "./network";
import { collectUnresolvedEntries, buildUnresolvedPilotError } from "./unresolved";
import { buildResolvedPilotTasks } from "./tasking";
import { createErrorCard } from "./stateTransitions";
import { extractErrorMessage, isAbortError } from "./pure";
import { runBreadthPilotPipeline } from "./breadthPipeline";
import { ZKILL_PAGE_MAX_ROUNDS } from "./constants";
import type {
  CancelCheck,
  DebugLogger,
  ErrorLogger,
  PipelineSignal,
  ProcessPilotFn,
  PilotCardUpdater
} from "./types";

type RunPipelineDeps = {
  createRetryNoticeHandler: typeof createRetryNoticeHandler;
  resolveCharacterIds: typeof resolveCharacterIds;
  collectUnresolvedEntries: typeof collectUnresolvedEntries;
  buildUnresolvedPilotError: typeof buildUnresolvedPilotError;
  buildResolvedPilotTasks: typeof buildResolvedPilotTasks;
  runBreadthPilotPipeline: typeof runBreadthPilotPipeline;
  createErrorCard: typeof createErrorCard;
  extractErrorMessage: typeof extractErrorMessage;
  isAbortError: typeof isAbortError;
};

const DEFAULT_DEPS: RunPipelineDeps = {
  createRetryNoticeHandler,
  resolveCharacterIds,
  collectUnresolvedEntries,
  buildUnresolvedPilotError,
  buildResolvedPilotTasks,
  runBreadthPilotPipeline,
  createErrorCard,
  extractErrorMessage,
  isAbortError
};

export async function runPilotPipeline(
  params: {
    entries: ParsedPilotInput[];
    lookbackDays: number;
    topShips: number;
    signal: PipelineSignal;
    isCancelled: CancelCheck;
    logDebug: DebugLogger;
    setNetworkNotice: Dispatch<SetStateAction<string>>;
    updatePilotCard: PilotCardUpdater;
    processPilot: ProcessPilotFn;
    logError: ErrorLogger;
    maxPages?: number;
  },
  deps: RunPipelineDeps = DEFAULT_DEPS
): Promise<void> {
  const onRetry = deps.createRetryNoticeHandler(params.setNetworkNotice);

  const names = params.entries.map((entry) => entry.pilotName);
  params.logDebug("Starting intel pipeline", {
    pilots: names,
    lookbackDays: params.lookbackDays,
    topShips: params.topShips
  });

  let idMap = new Map<string, number>();
  let idResolveError: string | null = null;
  try {
    idMap = await deps.resolveCharacterIds(names, params.signal, onRetry("ESI IDs"));
    params.logDebug("ESI IDs resolved", { resolved: idMap.size, requested: names.length });
  } catch (error) {
    if (deps.isAbortError(error)) {
      return;
    }
    idResolveError = deps.extractErrorMessage(error);
    params.logError("ESI IDs lookup failed", error);
    params.setNetworkNotice(`ESI IDs lookup failed: ${idResolveError}`);
    params.logDebug("ESI IDs failed", { error: idResolveError });
  }

  const unresolved = deps.collectUnresolvedEntries(params.entries, idMap);
  for (const entry of unresolved) {
    params.logDebug("Pilot unresolved in ESI IDs", { pilot: entry.pilotName });
    params.updatePilotCard(
      entry.pilotName,
      deps.createErrorCard(entry, deps.buildUnresolvedPilotError(idResolveError))
    );
  }

  const tasks = deps.buildResolvedPilotTasks(params.entries, idMap);
  await deps.runBreadthPilotPipeline({
    tasks,
    lookbackDays: params.lookbackDays,
    topShips: params.topShips,
    maxPages: params.maxPages ?? ZKILL_PAGE_MAX_ROUNDS,
    signal: params.signal,
    onRetry,
    isCancelled: params.isCancelled,
    updatePilotCard: params.updatePilotCard,
    logDebug: params.logDebug,
    logError: params.logError
  });
  if (!params.isCancelled()) {
    params.logDebug("Pipeline complete", {
      pilots: params.entries.length,
      unresolved: unresolved.length
    });
  }
}
