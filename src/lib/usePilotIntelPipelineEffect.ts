import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
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

const BACKGROUND_REVALIDATE_INTERVAL_MS = 30_000;

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
  mode: "interactive" | "background";
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
  const rosterSignature = params.entries
    .map((entry) => `${toPilotKey(entry.pilotName)}:${normalizeShipName(entry.explicitShip)}`)
    .join("|");
  const activeByPilotKeyRef = useRef<Map<string, ActivePilotRun>>(new Map());
  const lastParamsRef = useRef<{ lookbackDays: number; dogmaIndex: DogmaIndex | null } | null>(null);
  const lastRosterKeysRef = useRef<Set<string>>(new Set());
  const lastEntrySignatureByPilotKeyRef = useRef<Map<string, string>>(new Map());
  const characterIdByPilotKeyRef = useRef<Map<string, number>>(new Map());
  const latestHeadByPilotKeyRef = useRef<Map<string, { kills: string; losses: string }>>(new Map());
  const predictedShipsByPilotKeyRef = useRef<Map<string, PilotCard["predictedShips"]>>(new Map());
  const forceRefreshByPilotKeyRef = useRef<Set<string>>(new Set());
  const refreshInFlightByPilotKeyRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      for (const active of activeByPilotKeyRef.current.values()) {
        active.cancel();
      }
      activeByPilotKeyRef.current.clear();
      lastParamsRef.current = null;
      lastRosterKeysRef.current = new Set();
      lastEntrySignatureByPilotKeyRef.current.clear();
      characterIdByPilotKeyRef.current.clear();
      latestHeadByPilotKeyRef.current.clear();
      predictedShipsByPilotKeyRef.current.clear();
      forceRefreshByPilotKeyRef.current.clear();
      refreshInFlightByPilotKeyRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const { logDebug, logError } = deps.createPipelineLoggers(params.logDebugRef);
    const updatePilotCard = (pilotName: string, patch: Partial<PilotCard>) => {
      const pilotKey = toPilotKey(pilotName);
      const active = activeByPilotKeyRef.current.get(pilotKey);
      if (!active) {
        return;
      }
      if (Number.isFinite(patch.characterId)) {
        characterIdByPilotKeyRef.current.set(pilotKey, Number(patch.characterId));
      }
      if (!shouldApplyVisualPatch(active.mode, patch)) {
        return;
      }
      if (patch.inferenceKills || patch.inferenceLosses) {
        const current = latestHeadByPilotKeyRef.current.get(pilotKey) ?? { kills: "", losses: "" };
        latestHeadByPilotKeyRef.current.set(pilotKey, {
          kills: patch.inferenceKills ? killmailHeadSignature(patch.inferenceKills) : current.kills,
          losses: patch.inferenceLosses ? killmailHeadSignature(patch.inferenceLosses) : current.losses
        });
      }
      if (patch.predictedShips) {
        predictedShipsByPilotKeyRef.current.set(pilotKey, patch.predictedShips);
      }
      params.setPilotCards((current) => patchPilotCardRows(current, pilotName, patch));
    };

    if (params.entries.length === 0) {
      for (const active of activeByPilotKeyRef.current.values()) {
        active.cancel();
      }
      activeByPilotKeyRef.current.clear();
      lastEntrySignatureByPilotKeyRef.current.clear();
      characterIdByPilotKeyRef.current.clear();
      latestHeadByPilotKeyRef.current.clear();
      predictedShipsByPilotKeyRef.current.clear();
      forceRefreshByPilotKeyRef.current.clear();
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
    const entrySignatures = new Map(params.entries.map((entry) => [toPilotKey(entry.pilotName), buildEntrySignature(entry)]));
    const previousRoster = lastRosterKeysRef.current;
    const addedKeys = new Set<string>();
    const removedKeys = new Set<string>();
    const changedKeys = new Set<string>();
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
    for (const [key, signature] of entrySignatures.entries()) {
      const previous = lastEntrySignatureByPilotKeyRef.current.get(key);
      if (previous !== undefined && previous !== signature) {
        changedKeys.add(key);
      }
    }

    if (paramsChanged) {
      for (const active of activeByPilotKeyRef.current.values()) {
        active.cancel();
      }
      activeByPilotKeyRef.current.clear();
      params.setPilotCards(params.entries.map((entry) => deps.createLoadingCard(entry)));
      for (const entry of params.entries) {
        startPilotRun(entry, "interactive");
      }
    } else {
      for (const [pilotKey, active] of activeByPilotKeyRef.current.entries()) {
        if (removedKeys.has(pilotKey)) {
          active.cancel();
          activeByPilotKeyRef.current.delete(pilotKey);
          lastEntrySignatureByPilotKeyRef.current.delete(pilotKey);
          characterIdByPilotKeyRef.current.delete(pilotKey);
          latestHeadByPilotKeyRef.current.delete(pilotKey);
          predictedShipsByPilotKeyRef.current.delete(pilotKey);
          forceRefreshByPilotKeyRef.current.delete(pilotKey);
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
          startPilotRun(entry, "interactive");
        }
        if (changedKeys.has(pilotKey)) {
          // Entry signature changes (for example adding/changing explicit ship)
          // must recompute immediately even when zKill page-1 head is unchanged.
          startPilotRun(entry, "interactive");
          if (shouldForceRefreshForExplicitMismatch(entry, predictedShipsByPilotKeyRef.current.get(pilotKey))) {
            forceRefreshByPilotKeyRef.current.add(pilotKey);
          }
        }
      }
    }

    lastParamsRef.current = {
      lookbackDays: params.settings.lookbackDays,
      dogmaIndex: params.dogmaIndex
    };
    lastRosterKeysRef.current = desiredKeys;
    lastEntrySignatureByPilotKeyRef.current = entrySignatures;

    let disposed = false;
    if (paramsChanged || changedKeys.size > 0) {
      void runBackgroundRefreshSweep();
    }
    const timer = setInterval(() => {
      void runBackgroundRefreshSweep();
    }, BACKGROUND_REVALIDATE_INTERVAL_MS);

    function startPilotRun(entry: ParsedPilotInput, mode: "interactive" | "background"): void {
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
        mode,
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
        const forceNetwork = forceRefreshByPilotKeyRef.current.has(pilotKey);
        refreshInFlightByPilotKeyRef.current.add(pilotKey);
        try {
          const onCacheEvent = (side: "kills" | "losses") => (event: {
            forceNetwork: boolean;
            status: number;
            notModified: boolean;
            requestEtag?: string;
            requestLastModified?: string;
            responseEtag?: string;
            responseLastModified?: string;
          }) => {
            const payload = {
              pilot: entry.pilotName,
              side,
              ...event
            };
            logDebug("zKill page-1 refresh check", payload);
            if (event.forceNetwork) {
              logDebug("zKill page-1 forced refresh response", payload);
            }
          };
          const [killsPage, lossesPage] = await Promise.all([
            deps.fetchLatestKillsPage(
              characterId as number,
              1,
              undefined,
              undefined,
              {
                forceNetwork,
                onCacheEvent: onCacheEvent("kills")
              }
            ),
            deps.fetchLatestLossesPage(
              characterId as number,
              1,
              undefined,
              undefined,
              {
                forceNetwork,
                onCacheEvent: onCacheEvent("losses")
              }
            )
          ]);
          if (disposed) {
            return;
          }
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
          startPilotRun(entry, "background");
        } catch {
          // Keep stale card data when background refresh fails.
        } finally {
          forceRefreshByPilotKeyRef.current.delete(pilotKey);
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

function shouldApplyVisualPatch(mode: "interactive" | "background", patch: Partial<PilotCard>): boolean {
  if (mode !== "background") {
    return true;
  }
  if (patch.status === "error" || patch.fetchPhase === "error") {
    return true;
  }
  return patch.fetchPhase === "ready";
}

function toPilotKey(pilotName: string): string {
  return pilotName.trim().toLowerCase();
}

function killmailHeadSignature(rows: ZkillKillmail[]): string {
  return rows.slice(0, 200).map((row) => row.killmail_id).join(",");
}

function buildEntrySignature(entry: ParsedPilotInput): string {
  return `${toPilotKey(entry.pilotName)}|${normalizeShipName(entry.explicitShip)}`;
}

function normalizeShipName(ship: string | undefined): string {
  return ship?.trim().toLowerCase() ?? "";
}

function shouldForceRefreshForExplicitMismatch(
  entry: ParsedPilotInput,
  predictedShips: PilotCard["predictedShips"] | undefined
): boolean {
  const explicit = normalizeShipName(entry.explicitShip);
  if (!explicit || !predictedShips || predictedShips.length === 0) {
    return false;
  }
  const topInferred = predictedShips.find((ship) => ship.source === "inferred");
  if (!topInferred) {
    return false;
  }
  return normalizeShipName(topInferred.shipName) !== explicit;
}
