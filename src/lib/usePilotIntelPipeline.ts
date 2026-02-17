import { useEffect, useRef, useState } from "react";
import type { ParsedPilotInput, Settings } from "../types";
import { collectItemTypeIds, collectShipTypeIdsForNaming, derivePilotStats, type FitCandidate, type PilotStats, type ShipPrediction } from "./intel";
import type { ZkillKillmail } from "./api/zkill";
import { fetchCharacterStats, fetchLatestKills, fetchLatestKillsPaged, fetchLatestLosses, fetchLatestLossesPaged, fetchRecentKills, fetchRecentLosses } from "./api/zkill";
import { fetchCharacterPublic, resolveCharacterIds } from "./api/esi";
import { getCachedStateAsync } from "./cache";
import type { DogmaIndex } from "./dogma/index";
import type { CynoRisk } from "./cyno";
import {
  buildDerivedInferenceKey,
  extractErrorMessage,
  isAbortError,
  isDerivedInferenceUsable,
  mergeKillmailLists,
  mergePilotStats
} from "./pipeline/pure";
import { createErrorCard, createLoadingCard } from "./pipeline/stateTransitions";
import { resolveNamesSafely } from "./pipeline/naming";
import { ensureExplicitShipTypeId, recomputeDerivedInference, type DerivedInference } from "./pipeline/executors";

export type PilotCard = {
  parsedEntry: ParsedPilotInput;
  status: "idle" | "loading" | "ready" | "error";
  fetchPhase?: "loading" | "enriching" | "ready" | "error";
  error?: string;
  characterId?: number;
  characterName?: string;
  corporationId?: number;
  corporationName?: string;
  allianceId?: number;
  allianceName?: string;
  securityStatus?: number;
  stats?: PilotStats;
  predictedShips: ShipPrediction[];
  fitCandidates: FitCandidate[];
  cynoRisk?: CynoRisk;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  inferenceKills: ZkillKillmail[];
  inferenceLosses: ZkillKillmail[];
};

const DEEP_HISTORY_MAX_PAGES = 20;
const TOP_SHIP_CANDIDATES = 5;

export function usePilotIntelPipeline(params: {
  entries: ParsedPilotInput[];
  settings: Settings;
  dogmaIndex: DogmaIndex | null;
  logDebug: (message: string, data?: unknown) => void;
}): {
  pilotCards: PilotCard[];
  setPilotCards: React.Dispatch<React.SetStateAction<PilotCard[]>>;
  networkNotice: string;
  setNetworkNotice: React.Dispatch<React.SetStateAction<string>>;
} {
  const [pilotCards, setPilotCards] = useState<PilotCard[]>([]);
  const [networkNotice, setNetworkNotice] = useState<string>("");
  const logDebugRef = useRef(params.logDebug);

  useEffect(() => {
    logDebugRef.current = params.logDebug;
  }, [params.logDebug]);

  useEffect(() => {
    if (params.entries.length === 0) {
      setPilotCards([]);
      logDebugRef.current("No parsed entries. Waiting for paste.");
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    setNetworkNotice("");
    setPilotCards(params.entries.map((entry) => createLoadingCard(entry)));

    const updatePilotCard = (pilotName: string, patch: Partial<PilotCard>) => {
      if (cancelled) {
        return;
      }
      setPilotCards((current) =>
        current.map((row) =>
          row.parsedEntry.pilotName.toLowerCase() === pilotName.toLowerCase()
            ? { ...row, ...patch }
            : row
        )
      );
    };

    const loadDerivedInference = async (row: PilotCard, namesById: Map<number, string>) => {
      const derivedKey = buildDerivedInferenceKey({
        characterId: row.characterId!,
        lookbackDays: params.settings.lookbackDays,
        topShips: TOP_SHIP_CANDIDATES,
        explicitShip: row.parsedEntry.explicitShip,
        kills: row.inferenceKills,
        losses: row.inferenceLosses
      });

      const cached = await getCachedStateAsync<DerivedInference>(derivedKey);
      if (cached.value && isDerivedInferenceUsable(cached.value, row.parsedEntry.explicitShip)) {
        logDebugRef.current("Derived inference cache hit", {
          pilot: row.parsedEntry.pilotName,
          stale: cached.stale,
          predicted: cached.value.predictedShips.length
        });
        if (cached.stale) {
          void recomputeDerivedInference({
            row,
            settings: params.settings,
            namesById,
            cacheKey: derivedKey,
            debugLog: logDebugRef.current
          });
        }
        return cached.value;
      }

      logDebugRef.current("Derived inference cache miss/recompute", {
        pilot: row.parsedEntry.pilotName
      });
      return recomputeDerivedInference({
        row,
        settings: params.settings,
        namesById,
        cacheKey: derivedKey,
        debugLog: logDebugRef.current
      });
    };

    const processPilot = async (
      entry: ParsedPilotInput,
      characterId: number,
      onRetry: (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => void
    ) => {
      try {
        const [character, kills, losses, zkillStats] = await Promise.all([
          fetchCharacterPublic(characterId, abortController.signal, onRetry("ESI character")),
          fetchRecentKills(characterId, params.settings.lookbackDays, abortController.signal, onRetry("zKill kills")),
          fetchRecentLosses(characterId, params.settings.lookbackDays, abortController.signal, onRetry("zKill losses")),
          fetchCharacterStats(characterId, abortController.signal, onRetry("zKill stats"))
        ]);

        if (cancelled) {
          return;
        }

        let inferenceKills = kills;
        let inferenceLosses = losses;
        if (kills.length === 0) {
          inferenceKills = await fetchLatestKills(characterId, abortController.signal, onRetry("zKill latest kills"));
        }
        if (losses.length === 0) {
          inferenceLosses = await fetchLatestLosses(characterId, abortController.signal, onRetry("zKill latest losses"));
        }
        if (kills.length === 0 || losses.length === 0) {
          logDebugRef.current("Fallback zKill inference window used", {
            pilot: entry.pilotName,
            characterId,
            fallbackKills: inferenceKills.length,
            fallbackLosses: inferenceLosses.length
          });
        }
        logDebugRef.current("Fetched zKill data", {
          pilot: entry.pilotName,
          characterId,
          kills: kills.length,
          losses: losses.length,
          zkillStats: Boolean(zkillStats)
        });

        const stageOneIds = [
          ...collectShipTypeIdsForNaming(inferenceKills, inferenceLosses, characterId),
          ...collectItemTypeIds(inferenceLosses),
          character.corporation_id,
          character.alliance_id
        ].filter((value): value is number => Number.isFinite(value));
        const stageOneNames = await resolveNamesSafely({
          ids: stageOneIds,
          signal: abortController.signal,
          onRetry,
          dogmaIndex: params.dogmaIndex,
          logDebug: logDebugRef.current
        });

        const stageOneRow: PilotCard = {
          parsedEntry: entry,
          status: "ready",
          fetchPhase: "enriching",
          characterId,
          characterName: character.name,
          corporationId: character.corporation_id,
          corporationName: stageOneNames.get(character.corporation_id),
          allianceId: character.alliance_id,
          allianceName: character.alliance_id ? stageOneNames.get(character.alliance_id) : undefined,
          securityStatus: character.security_status,
          stats: mergePilotStats({
            derived: derivePilotStats(characterId, kills, losses),
            zkillStats
          }),
          predictedShips: [],
          fitCandidates: [],
          kills,
          losses,
          inferenceKills,
          inferenceLosses
        };

        const stageOneDerived = await loadDerivedInference(stageOneRow, stageOneNames);
        await ensureExplicitShipTypeId({
          predictedShips: stageOneDerived.predictedShips,
          parsedEntry: entry,
          signal: abortController.signal,
          onRetry,
          logDebug: logDebugRef.current
        });
        updatePilotCard(entry.pilotName, {
          ...stageOneRow,
          predictedShips: stageOneDerived.predictedShips,
          fitCandidates: stageOneDerived.fitCandidates,
          cynoRisk: stageOneDerived.cynoRisk
        });
        logDebugRef.current("Pilot stage 1 ready", {
          pilot: entry.pilotName,
          predicted: stageOneDerived.predictedShips.length
        });

        const [deepKills, deepLosses] = await Promise.all([
          fetchLatestKillsPaged(characterId, DEEP_HISTORY_MAX_PAGES, abortController.signal, onRetry("zKill deep kills")),
          fetchLatestLossesPaged(characterId, DEEP_HISTORY_MAX_PAGES, abortController.signal, onRetry("zKill deep losses"))
        ]);
        if (cancelled) {
          return;
        }

        const mergedInferenceKills = mergeKillmailLists(inferenceKills, deepKills);
        const mergedInferenceLosses = mergeKillmailLists(inferenceLosses, deepLosses);
        logDebugRef.current("Pilot deep history merged", {
          pilot: entry.pilotName,
          inferenceKills: mergedInferenceKills.length,
          inferenceLosses: mergedInferenceLosses.length
        });

        const stageTwoIds = [
          ...collectShipTypeIdsForNaming(mergedInferenceKills, mergedInferenceLosses, characterId),
          ...collectItemTypeIds(mergedInferenceLosses),
          character.corporation_id,
          character.alliance_id
        ].filter((value): value is number => Number.isFinite(value));
        const stageTwoNames = await resolveNamesSafely({
          ids: stageTwoIds,
          signal: abortController.signal,
          onRetry,
          dogmaIndex: params.dogmaIndex,
          logDebug: logDebugRef.current
        });
        const stageTwoRow: PilotCard = {
          ...stageOneRow,
          fetchPhase: "ready",
          corporationName: stageTwoNames.get(character.corporation_id),
          allianceName: character.alliance_id ? stageTwoNames.get(character.alliance_id) : undefined,
          inferenceKills: mergedInferenceKills,
          inferenceLosses: mergedInferenceLosses
        };
        const stageTwoDerived = await loadDerivedInference(stageTwoRow, stageTwoNames);
        await ensureExplicitShipTypeId({
          predictedShips: stageTwoDerived.predictedShips,
          parsedEntry: entry,
          signal: abortController.signal,
          onRetry,
          logDebug: logDebugRef.current
        });
        updatePilotCard(entry.pilotName, {
          ...stageTwoRow,
          predictedShips: stageTwoDerived.predictedShips,
          fitCandidates: stageTwoDerived.fitCandidates,
          cynoRisk: stageTwoDerived.cynoRisk
        });
        logDebugRef.current("Pilot stage 2 ready", {
          pilot: entry.pilotName,
          predicted: stageTwoDerived.predictedShips.length,
          fits: stageTwoDerived.fitCandidates.length
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        const reason = extractErrorMessage(error);
        console.error(`Pilot intel fetch failed for ${entry.pilotName}`, error);
        logDebugRef.current("Pilot fetch failed", { pilot: entry.pilotName, error: reason });
        updatePilotCard(entry.pilotName, createErrorCard(entry, `Failed to fetch pilot intel: ${reason}`));
      }
    };

    void (async () => {
      const onRetry = (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => {
        setNetworkNotice(
          `${scope}: rate-limited/retryable response (${info.status}), retry ${info.attempt} in ${info.delayMs}ms`
        );
      };

      const names = params.entries.map((entry) => entry.pilotName);
      logDebugRef.current("Starting intel pipeline", {
        pilots: names,
        lookbackDays: params.settings.lookbackDays,
        topShips: TOP_SHIP_CANDIDATES
      });
      let idMap = new Map<string, number>();
      let idResolveError: string | null = null;
      try {
        idMap = await resolveCharacterIds(names, abortController.signal, onRetry("ESI IDs"));
        logDebugRef.current("ESI IDs resolved", { resolved: idMap.size, requested: names.length });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        idResolveError = extractErrorMessage(error);
        console.error("ESI IDs lookup failed", error);
        setNetworkNotice(`ESI IDs lookup failed: ${idResolveError}`);
        logDebugRef.current("ESI IDs failed", { error: idResolveError });
      }

      const unresolved = params.entries.filter((entry) => !idMap.get(entry.pilotName.toLowerCase()));
      for (const entry of unresolved) {
        logDebugRef.current("Pilot unresolved in ESI IDs", { pilot: entry.pilotName });
        updatePilotCard(
          entry.pilotName,
          createErrorCard(
            entry,
            idResolveError ? `Character unresolved (ESI IDs error: ${idResolveError})` : "Character not found in ESI."
          )
        );
      }

      const tasks = params.entries
        .map((entry) => ({ entry, characterId: idMap.get(entry.pilotName.toLowerCase()) }))
        .filter((item): item is { entry: ParsedPilotInput; characterId: number } => Boolean(item.characterId))
        .map((item) => processPilot(item.entry, item.characterId, onRetry));

      await Promise.allSettled(tasks);
      if (!cancelled) {
        logDebugRef.current("Pipeline complete", {
          pilots: params.entries.length,
          unresolved: unresolved.length
        });
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [params.entries, params.settings.lookbackDays, params.dogmaIndex]);

  return { pilotCards, setPilotCards, networkNotice, setNetworkNotice };
}
