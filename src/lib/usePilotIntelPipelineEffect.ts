import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ParsedPilotInput, Settings } from "../types";
import type { DogmaIndex } from "./dogma/index";
import type { PilotCard } from "./usePilotIntelPipeline";
import { createLoadingCard } from "./pipeline/stateTransitions";
import { createPipelineLoggers } from "./pipeline/hookLogging";
import { createProcessPilot } from "./pipeline/processPilotFactory";
import { runPilotPipeline } from "./pipeline/runPipeline";
import { DEEP_HISTORY_MAX_PAGES, TOP_SHIP_CANDIDATES } from "./pipeline/constants";
import type { DebugLoggerRef } from "./pipeline/types";
import { patchPilotCardRows } from "./pipeline/cards";

type EffectDeps = {
  createLoadingCard: typeof createLoadingCard;
  createPipelineLoggers: typeof createPipelineLoggers;
  createProcessPilot: typeof createProcessPilot;
  runPilotPipeline: typeof runPilotPipeline;
};

const DEFAULT_DEPS: EffectDeps = {
  createLoadingCard,
  createPipelineLoggers,
  createProcessPilot,
  runPilotPipeline
};

type ActivePilotRun = {
  pilotKey: string;
  entry: ParsedPilotInput;
  abortController: AbortController;
  cancel: () => void;
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
  const activeByPilotKeyRef = useRef<Map<string, ActivePilotRun>>(new Map());
  const lastParamsRef = useRef<{ lookbackDays: number; dogmaIndex: DogmaIndex | null } | null>(null);
  const lastRosterKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      for (const active of activeByPilotKeyRef.current.values()) {
        active.cancel();
      }
      activeByPilotKeyRef.current.clear();
      lastParamsRef.current = null;
      lastRosterKeysRef.current = new Set();
    };
  }, []);

  useEffect(() => {
    const { logDebug, logError } = deps.createPipelineLoggers(params.logDebugRef);
    const updatePilotCard = (pilotName: string, patch: Partial<PilotCard>) => {
      const pilotKey = toPilotKey(pilotName);
      if (!activeByPilotKeyRef.current.has(pilotKey)) {
        return;
      }
      params.setPilotCards((current) => patchPilotCardRows(current, pilotName, patch));
    };

    if (params.entries.length === 0) {
      for (const active of activeByPilotKeyRef.current.values()) {
        active.cancel();
      }
      activeByPilotKeyRef.current.clear();
      lastParamsRef.current = {
        lookbackDays: params.settings.lookbackDays,
        dogmaIndex: params.dogmaIndex
      };
      lastRosterKeysRef.current = new Set();
      params.setPilotCards([]);
      params.logDebugRef.current("No parsed entries. Waiting for paste.");
      return;
    }

    params.setNetworkNotice("");

    const paramsChanged =
      !lastParamsRef.current ||
      lastParamsRef.current.lookbackDays !== params.settings.lookbackDays ||
      lastParamsRef.current.dogmaIndex !== params.dogmaIndex;

    const desiredKeys = new Set(params.entries.map((entry) => toPilotKey(entry.pilotName)));
    const previousRoster = lastRosterKeysRef.current;
    const addedKeys = new Set<string>();
    const removedKeys = new Set<string>();
    for (const key of desiredKeys) {
      if (!previousRoster.has(key)) {
        addedKeys.add(key);
      }
    }
    for (const key of previousRoster) {
      if (!desiredKeys.has(key)) {
        removedKeys.add(key);
      }
    }

    if (paramsChanged) {
      for (const active of activeByPilotKeyRef.current.values()) {
        active.cancel();
      }
      activeByPilotKeyRef.current.clear();
      params.setPilotCards(params.entries.map((entry) => deps.createLoadingCard(entry)));
      for (const entry of params.entries) {
        startPilotRun(entry);
      }
    } else {
      for (const [pilotKey, active] of activeByPilotKeyRef.current.entries()) {
        if (removedKeys.has(pilotKey)) {
          active.cancel();
          activeByPilotKeyRef.current.delete(pilotKey);
        }
      }

      params.setPilotCards((current) => {
        const byPilot = new Map(current.map((row) => [toPilotKey(row.parsedEntry.pilotName), row]));
        return params.entries.map((entry) => {
          const pilotKey = toPilotKey(entry.pilotName);
          const existing = byPilot.get(pilotKey);
          if (existing) {
            return existing;
          }
          return deps.createLoadingCard(entry);
        });
      });

      for (const entry of params.entries) {
        const pilotKey = toPilotKey(entry.pilotName);
        if (addedKeys.has(pilotKey) && !activeByPilotKeyRef.current.has(pilotKey)) {
          startPilotRun(entry);
        }
      }
    }

    lastParamsRef.current = {
      lookbackDays: params.settings.lookbackDays,
      dogmaIndex: params.dogmaIndex
    };
    lastRosterKeysRef.current = desiredKeys;

    function startPilotRun(entry: ParsedPilotInput): void {
      const pilotKey = toPilotKey(entry.pilotName);
      const abortController = new AbortController();
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        abortController.abort();
      };

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

      const activeRun: ActivePilotRun = {
        pilotKey,
        entry,
        abortController,
        cancel
      };
      activeByPilotKeyRef.current.set(pilotKey, activeRun);

      void deps.runPilotPipeline({
        entries: [entry],
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
      }).finally(() => {
        const current = activeByPilotKeyRef.current.get(pilotKey);
        if (current && current.abortController === abortController) {
          activeByPilotKeyRef.current.delete(pilotKey);
        }
      });
    }
  }, [params.entries, params.settings.lookbackDays, params.dogmaIndex]);
}

function toPilotKey(pilotName: string): string {
  return pilotName.trim().toLowerCase();
}
