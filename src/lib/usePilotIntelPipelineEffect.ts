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
import { fetchLatestKillsPage, fetchLatestLossesPage, type ZkillKillmail } from "./api/zkill";

const BACKGROUND_REVALIDATE_INTERVAL_MS = 45_000;

type EffectDeps = {
  createLoadingCard: typeof createLoadingCard;
  createPipelineLoggers: typeof createPipelineLoggers;
  createProcessPilot: typeof createProcessPilot;
  runPilotPipeline: typeof runPilotPipeline;
  fetchLatestKillsPage: typeof fetchLatestKillsPage;
  fetchLatestLossesPage: typeof fetchLatestLossesPage;
};

const DEFAULT_DEPS: EffectDeps = {
  createLoadingCard,
  createPipelineLoggers,
  createProcessPilot,
  runPilotPipeline,
  fetchLatestKillsPage,
  fetchLatestLossesPage
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
  const rosterSignature = params.entries.map((entry) => toPilotKey(entry.pilotName)).join("|");
  const activeByPilotKeyRef = useRef<Map<string, ActivePilotRun>>(new Map());
  const lastParamsRef = useRef<{ lookbackDays: number; dogmaIndex: DogmaIndex | null } | null>(null);
  const lastRosterKeysRef = useRef<Set<string>>(new Set());
  const characterIdByPilotKeyRef = useRef<Map<string, number>>(new Map());
  const latestHeadByPilotKeyRef = useRef<Map<string, { kills: string; losses: string }>>(new Map());
  const refreshInFlightByPilotKeyRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      for (const active of activeByPilotKeyRef.current.values()) {
        active.cancel();
      }
      activeByPilotKeyRef.current.clear();
      lastParamsRef.current = null;
      lastRosterKeysRef.current = new Set();
      characterIdByPilotKeyRef.current.clear();
      latestHeadByPilotKeyRef.current.clear();
      refreshInFlightByPilotKeyRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const { logDebug, logError } = deps.createPipelineLoggers(params.logDebugRef);
    const updatePilotCard = (pilotName: string, patch: Partial<PilotCard>) => {
      const pilotKey = toPilotKey(pilotName);
      if (!activeByPilotKeyRef.current.has(pilotKey)) {
        return;
      }
      if (Number.isFinite(patch.characterId)) {
        characterIdByPilotKeyRef.current.set(pilotKey, Number(patch.characterId));
      }
      if (patch.inferenceKills || patch.inferenceLosses) {
        const current = latestHeadByPilotKeyRef.current.get(pilotKey) ?? { kills: "", losses: "" };
        latestHeadByPilotKeyRef.current.set(pilotKey, {
          kills: patch.inferenceKills ? killmailHeadSignature(patch.inferenceKills) : current.kills,
          losses: patch.inferenceLosses ? killmailHeadSignature(patch.inferenceLosses) : current.losses
        });
      }
      params.setPilotCards((current) => patchPilotCardRows(current, pilotName, patch));
    };

    if (params.entries.length === 0) {
      for (const active of activeByPilotKeyRef.current.values()) {
        active.cancel();
      }
      activeByPilotKeyRef.current.clear();
      characterIdByPilotKeyRef.current.clear();
      latestHeadByPilotKeyRef.current.clear();
      refreshInFlightByPilotKeyRef.current.clear();
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
          characterIdByPilotKeyRef.current.delete(pilotKey);
          latestHeadByPilotKeyRef.current.delete(pilotKey);
          refreshInFlightByPilotKeyRef.current.delete(pilotKey);
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

    let disposed = false;
    if (paramsChanged) {
      void runBackgroundRefreshSweep();
    }
    const timer = setInterval(() => {
      void runBackgroundRefreshSweep();
    }, BACKGROUND_REVALIDATE_INTERVAL_MS);

    function startPilotRun(entry: ParsedPilotInput): void {
      const pilotKey = toPilotKey(entry.pilotName);
      if (activeByPilotKeyRef.current.has(pilotKey)) {
        return;
      }
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

    async function runBackgroundRefreshSweep(): Promise<void> {
      if (disposed) {
        return;
      }
      for (const entry of params.entries) {
        const pilotKey = toPilotKey(entry.pilotName);
        if (activeByPilotKeyRef.current.has(pilotKey)) {
          continue;
        }
        if (refreshInFlightByPilotKeyRef.current.has(pilotKey)) {
          continue;
        }
        const characterId = characterIdByPilotKeyRef.current.get(pilotKey);
        if (!Number.isFinite(characterId)) {
          continue;
        }
        refreshInFlightByPilotKeyRef.current.add(pilotKey);
        try {
          const [killsPage, lossesPage] = await Promise.all([
            deps.fetchLatestKillsPage(characterId as number, 1),
            deps.fetchLatestLossesPage(characterId as number, 1)
          ]);
          const nextHead = {
            kills: killmailHeadSignature(killsPage),
            losses: killmailHeadSignature(lossesPage)
          };
          const previous = latestHeadByPilotKeyRef.current.get(pilotKey);
          latestHeadByPilotKeyRef.current.set(pilotKey, nextHead);
          if (previous && previous.kills === nextHead.kills && previous.losses === nextHead.losses) {
            continue;
          }
          if (!previous) {
            continue;
          }
          startPilotRun(entry);
        } catch {
          // Keep stale card data when background refresh fails.
        } finally {
          refreshInFlightByPilotKeyRef.current.delete(pilotKey);
        }
      }
    }

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [rosterSignature, params.settings.lookbackDays, params.dogmaIndex]);
}

function toPilotKey(pilotName: string): string {
  return pilotName.trim().toLowerCase();
}

function killmailHeadSignature(rows: ZkillKillmail[]): string {
  return rows.slice(0, 200).map((row) => row.killmail_id).join(",");
}
