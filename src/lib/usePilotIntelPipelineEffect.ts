import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ParsedPilotInput, Settings } from "../types";
import type { DogmaIndex } from "./dogma/index";
import type { PilotCard } from "./usePilotIntelPipeline";
import { createLoadingCard } from "./pipeline/stateTransitions";
import { createPilotCardUpdater } from "./pipeline/cards";
import { createPipelineLoggers } from "./pipeline/hookLogging";
import { createProcessPilot } from "./pipeline/processPilotFactory";
import { runPilotPipeline } from "./pipeline/runPipeline";
import { DEEP_HISTORY_MAX_PAGES, TOP_SHIP_CANDIDATES } from "./pipeline/constants";
import type { DebugLoggerRef } from "./pipeline/types";

type EffectDeps = {
  createLoadingCard: typeof createLoadingCard;
  createPilotCardUpdater: typeof createPilotCardUpdater;
  createPipelineLoggers: typeof createPipelineLoggers;
  createProcessPilot: typeof createProcessPilot;
  runPilotPipeline: typeof runPilotPipeline;
};

const DEFAULT_DEPS: EffectDeps = {
  createLoadingCard,
  createPilotCardUpdater,
  createPipelineLoggers,
  createProcessPilot,
  runPilotPipeline
};

export function usePilotIntelPipelineEffect(
  params: {
    entries: ParsedPilotInput[];
    settings: Settings;
    dogmaIndex: DogmaIndex | null;
    logDebugRef: DebugLoggerRef;
    setPilotCards: Dispatch<SetStateAction<PilotCard[]>>;
    setNetworkNotice: Dispatch<SetStateAction<string>>;
  },
  deps: EffectDeps = DEFAULT_DEPS
): void {
  useEffect(() => {
    if (params.entries.length === 0) {
      params.setPilotCards([]);
      params.logDebugRef.current("No parsed entries. Waiting for paste.");
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    params.setNetworkNotice("");
    params.setPilotCards(params.entries.map((entry) => deps.createLoadingCard(entry)));

    const updatePilotCard = deps.createPilotCardUpdater({
      isCancelled: () => cancelled,
      setPilotCards: params.setPilotCards
    });
    const { logDebug, logError } = deps.createPipelineLoggers(params.logDebugRef);

    const processPilot = deps.createProcessPilot({
      settings: params.settings,
      dogmaIndex: params.dogmaIndex,
      signal: abortController.signal,
      isCancelled: () => cancelled,
      updatePilotCard,
      logDebug,
      logError,
      topShips: TOP_SHIP_CANDIDATES,
      deepHistoryMaxPages: DEEP_HISTORY_MAX_PAGES
    });

    void deps.runPilotPipeline({
      entries: params.entries,
      lookbackDays: params.settings.lookbackDays,
      topShips: TOP_SHIP_CANDIDATES,
      signal: abortController.signal,
      isCancelled: () => cancelled,
      logDebug,
      setNetworkNotice: params.setNetworkNotice,
      updatePilotCard,
      processPilot,
      logError,
      maxPages: DEEP_HISTORY_MAX_PAGES
    });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [params.entries, params.settings.lookbackDays, params.dogmaIndex]);
}
