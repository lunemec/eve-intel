import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { ParsedPilotInput, Settings } from "../types";
import type { DogmaIndex } from "./dogma/index";
import type { PilotCard } from "./pilotDomain";
import { createLoadingCard } from "./pipeline/stateTransitions";
import { createPipelineLoggers } from "./pipeline/hookLogging";
import { runPilotPipeline } from "./pipeline/runPipeline";
import { DEEP_HISTORY_MAX_PAGES, TOP_SHIP_CANDIDATES } from "./pipeline/constants";
import type { DebugLoggerRef } from "./pipeline/types";
import { patchPilotCardRows } from "./pipeline/cards";
import { fetchLatestKillsPage, fetchLatestLossesPage } from "./api/zkill";
import { setThrottleFleetSize } from "./api/zkill/throttle";
import {
  killmailHeadSignature,
  normalizeShipName,
  shouldForceRefreshForExplicitMismatch,
  toPilotKey
} from "./pipeline/pilotIdentity";
import { diffPilotRoster } from "./pipeline/rosterDiff";
import {
  type ActivePilotRun,
  cancelAllPilotRuns,
  cancelPilotRun,
  requestPilotRun
} from "./pipeline/runLifecycle";
import {
  collectBackgroundRefreshCandidates,
  updatePilotRefreshHead
} from "./pipeline/backgroundRefresh";

const BACKGROUND_REVALIDATE_INTERVAL_MS = 150_000;

type EffectDeps = {
  createLoadingCard: typeof createLoadingCard;
  createPipelineLoggers: typeof createPipelineLoggers;
  runPilotPipeline: typeof runPilotPipeline;
  fetchLatestKillsPage: typeof fetchLatestKillsPage;
  fetchLatestLossesPage: typeof fetchLatestLossesPage;
};

const DEFAULT_DEPS: EffectDeps = {
  createLoadingCard,
  createPipelineLoggers,
  runPilotPipeline,
  fetchLatestKillsPage,
  fetchLatestLossesPage
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
  const pendingByPilotKeyRef = useRef<Map<string, { entry: ParsedPilotInput; mode: "interactive" | "background" }>>(new Map());
  const lastParamsRef = useRef<{ lookbackDays: number; dogmaIndex: DogmaIndex | null } | null>(null);
  const lastRosterKeysRef = useRef<Set<string>>(new Set());
  const lastEntrySignatureByPilotKeyRef = useRef<Map<string, string>>(new Map());
  const characterIdByPilotKeyRef = useRef<Map<string, number>>(new Map());
  const latestHeadByPilotKeyRef = useRef<Map<string, { kills: string; losses: string }>>(new Map());
  const predictedShipsByPilotKeyRef = useRef<Map<string, PilotCard["predictedShips"]>>(new Map());
  const forceRefreshByPilotKeyRef = useRef<Set<string>>(new Set());
  const refreshInFlightByPilotKeyRef = useRef<Set<string>>(new Set());
  const rateLimitRetryCountRef = useRef<Map<string, number>>(new Map());
  const rateLimitRetryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const errorPilotKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      cancelAllPilotRuns({
        activeByPilotKey: activeByPilotKeyRef.current,
        pendingByPilotKey: pendingByPilotKeyRef.current
      });
      lastParamsRef.current = null;
      lastRosterKeysRef.current = new Set();
      lastEntrySignatureByPilotKeyRef.current.clear();
      characterIdByPilotKeyRef.current.clear();
      latestHeadByPilotKeyRef.current.clear();
      predictedShipsByPilotKeyRef.current.clear();
      forceRefreshByPilotKeyRef.current.clear();
      refreshInFlightByPilotKeyRef.current.clear();
      for (const handle of rateLimitRetryTimersRef.current.values()) {
        clearTimeout(handle);
      }
      rateLimitRetryTimersRef.current.clear();
      rateLimitRetryCountRef.current.clear();
      errorPilotKeysRef.current.clear();
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
      if (patch.status === "error") {
        errorPilotKeysRef.current.add(pilotKey);
      } else if (patch.status === "ready") {
        errorPilotKeysRef.current.delete(pilotKey);
      }
      params.setPilotCards((current) => patchPilotCardRows(current, pilotName, patch));
    };

    if (params.entries.length === 0) {
      cancelAllPilotRuns({
        activeByPilotKey: activeByPilotKeyRef.current,
        pendingByPilotKey: pendingByPilotKeyRef.current
      });
      lastEntrySignatureByPilotKeyRef.current.clear();
      characterIdByPilotKeyRef.current.clear();
      latestHeadByPilotKeyRef.current.clear();
      predictedShipsByPilotKeyRef.current.clear();
      forceRefreshByPilotKeyRef.current.clear();
      refreshInFlightByPilotKeyRef.current.clear();
      for (const handle of rateLimitRetryTimersRef.current.values()) {
        clearTimeout(handle);
      }
      rateLimitRetryTimersRef.current.clear();
      rateLimitRetryCountRef.current.clear();
      errorPilotKeysRef.current.clear();
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

    // Set throttle fleet size so spacing adapts to total pilot count.
    setThrottleFleetSize(params.entries.length);

    const paramsChanged =
      !lastParamsRef.current ||
      lastParamsRef.current.lookbackDays !== params.settings.lookbackDays ||
      lastParamsRef.current.dogmaIndex !== params.dogmaIndex;

    const { desiredKeys, entrySignatures, addedKeys, removedKeys, changedKeys } = diffPilotRoster({
      entries: params.entries,
      previousRosterKeys: lastRosterKeysRef.current,
      previousEntrySignatureByPilotKey: lastEntrySignatureByPilotKeyRef.current
    });

    if (paramsChanged) {
      cancelAllPilotRuns({
        activeByPilotKey: activeByPilotKeyRef.current,
        pendingByPilotKey: pendingByPilotKeyRef.current
      });
      params.setPilotCards(params.entries.map((entry) => deps.createLoadingCard(entry)));
      for (const entry of params.entries) {
        requestRun(entry, "interactive", false);
      }
    } else {
      for (const pilotKey of removedKeys) {
        cancelPilotRun({
          pilotKey,
          activeByPilotKey: activeByPilotKeyRef.current,
          pendingByPilotKey: pendingByPilotKeyRef.current
        });
        lastEntrySignatureByPilotKeyRef.current.delete(pilotKey);
        characterIdByPilotKeyRef.current.delete(pilotKey);
        latestHeadByPilotKeyRef.current.delete(pilotKey);
        predictedShipsByPilotKeyRef.current.delete(pilotKey);
        forceRefreshByPilotKeyRef.current.delete(pilotKey);
        refreshInFlightByPilotKeyRef.current.delete(pilotKey);
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
          requestRun(entry, "interactive", false);
        }
        if (changedKeys.has(pilotKey)) {
          // Entry signature changes (for example adding/changing explicit ship)
          // must recompute immediately even when zKill page-1 head is unchanged.
          requestRun(entry, "interactive", true);
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

    const RATE_LIMIT_RETRY_DELAY_MS = 10_000;
    const RATE_LIMIT_RETRY_JITTER_MS = 2_000;
    const MAX_RATE_LIMIT_RETRIES = 3;

    function scheduleRateLimitRetry(pilotName: string): void {
      const pilotKey = toPilotKey(pilotName);
      const attempts = rateLimitRetryCountRef.current.get(pilotKey) ?? 0;
      if (attempts >= MAX_RATE_LIMIT_RETRIES) {
        logDebug("Rate limit retry cap reached", { pilot: pilotName, attempts });
        return;
      }
      // Clear any existing timer for this pilot
      const existing = rateLimitRetryTimersRef.current.get(pilotKey);
      if (existing) {
        clearTimeout(existing);
      }
      rateLimitRetryCountRef.current.set(pilotKey, attempts + 1);
      const jitter = Math.random() * RATE_LIMIT_RETRY_JITTER_MS;
      const delayMs = RATE_LIMIT_RETRY_DELAY_MS + jitter;
      logDebug("Rate limit retry scheduled", { pilot: pilotName, attempt: attempts + 1, delayMs: Math.round(delayMs) });
      const handle = setTimeout(() => {
        rateLimitRetryTimersRef.current.delete(pilotKey);
        if (disposed) {
          return;
        }
        const entry = params.entries.find((e) => toPilotKey(e.pilotName) === pilotKey);
        if (!entry) {
          return;
        }
        logDebug("Rate limit retry firing", { pilot: pilotName, attempt: attempts + 1 });
        requestRun(entry, "background", false);
      }, delayMs);
      rateLimitRetryTimersRef.current.set(pilotKey, handle);
    }

    if (paramsChanged || changedKeys.size > 0) {
      void runBackgroundRefreshSweep();
    }
    const timer = setInterval(() => {
      void runBackgroundRefreshSweep();
    }, BACKGROUND_REVALIDATE_INTERVAL_MS);

    function requestRun(
      entry: ParsedPilotInput,
      mode: "interactive" | "background",
      queueIfActive: boolean
    ): void {
      if (mode === "interactive") {
        // Reset retry count on interactive runs (user re-paste)
        const pilotKey = toPilotKey(entry.pilotName);
        rateLimitRetryCountRef.current.delete(pilotKey);
        const existingTimer = rateLimitRetryTimersRef.current.get(pilotKey);
        if (existingTimer) {
          clearTimeout(existingTimer);
          rateLimitRetryTimersRef.current.delete(pilotKey);
        }
      }
      requestPilotRun({
        entry,
        mode,
        queueIfActive,
        activeByPilotKey: activeByPilotKeyRef.current,
        pendingByPilotKey: pendingByPilotKeyRef.current,
        launchRun: async ({ entry: runEntry, abortController, isCancelled }) => {
          await deps.runPilotPipeline({
            entries: [runEntry],
            lookbackDays: params.settings.lookbackDays,
            topShips: TOP_SHIP_CANDIDATES,
            dogmaIndex: params.dogmaIndex,
            signal: abortController.signal,
            isCancelled,
            logDebug,
            setNetworkNotice: params.setNetworkNotice,
            updatePilotCard,
            logError,
            maxPages: DEEP_HISTORY_MAX_PAGES,
            scheduleRateLimitRetry
          });
        }
      });
    }

    async function runBackgroundRefreshSweep(): Promise<void> {
      if (disposed) {
        return;
      }
      const candidates = collectBackgroundRefreshCandidates({
        entries: params.entries,
        isPilotRunActive: (pilotKey) => activeByPilotKeyRef.current.has(pilotKey),
        refreshInFlightByPilotKey: refreshInFlightByPilotKeyRef.current,
        characterIdByPilotKey: characterIdByPilotKeyRef.current,
        forceRefreshByPilotKey: forceRefreshByPilotKeyRef.current
      });
      for (const candidate of candidates) {
        const { entry, pilotKey, characterId, forceNetwork } = candidate;
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
              characterId,
              1,
              undefined,
              undefined,
              {
                forceNetwork,
                onCacheEvent: onCacheEvent("kills")
              }
            ),
            deps.fetchLatestLossesPage(
              characterId,
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
          const status = updatePilotRefreshHead({
            latestHeadByPilotKey: latestHeadByPilotKeyRef.current,
            pilotKey,
            nextHead
          });
          if (status === "unchanged" || status === "initial") {
            continue;
          }
          requestRun(entry, "background", false);
        } catch (error) {
          // Keep stale card data when background refresh fails, but emit telemetry.
          logDebug("zKill page-1 refresh failed", {
            pilot: entry.pilotName,
            forceNetwork,
            error: error instanceof Error ? error.message : String(error)
          });
        } finally {
          forceRefreshByPilotKeyRef.current.delete(pilotKey);
          refreshInFlightByPilotKeyRef.current.delete(pilotKey);
        }
      }

      // Safety net: also retry pilots stuck in error state
      for (const pilotKey of errorPilotKeysRef.current) {
        if (disposed) {
          return;
        }
        if (activeByPilotKeyRef.current.has(pilotKey)) {
          continue;
        }
        const entry = params.entries.find((e) => toPilotKey(e.pilotName) === pilotKey);
        if (!entry) {
          errorPilotKeysRef.current.delete(pilotKey);
          continue;
        }
        logDebug("Background sweep retrying error pilot", { pilot: entry.pilotName });
        requestRun(entry, "background", false);
      }
    }

    return () => {
      disposed = true;
      clearInterval(timer);
      for (const handle of rateLimitRetryTimersRef.current.values()) {
        clearTimeout(handle);
      }
      rateLimitRetryTimersRef.current.clear();
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
