import { useEffect, useRef, useState } from "react";
import type { ParsedPilotInput, Settings } from "../types";
import { collectItemTypeIds, collectShipTypeIdsForNaming, deriveFitCandidates, derivePilotStats, deriveShipPredictions, summarizeEvidenceCoverage, summarizeTopEvidenceShips, type FitCandidate, type PilotStats, type ShipPrediction } from "./intel";
import type { ZkillCharacterStats, ZkillKillmail } from "./api/zkill";
import { fetchCharacterStats, fetchLatestKills, fetchLatestKillsPaged, fetchLatestLosses, fetchLatestLossesPaged, fetchRecentKills, fetchRecentLosses } from "./api/zkill";
import { fetchCharacterPublic, resolveCharacterIds, resolveInventoryTypeIdByName, resolveUniverseNames } from "./api/esi";
import { getCachedStateAsync, setCachedAsync } from "./cache";
import { withDogmaTypeNameFallback } from "./names";
import type { DogmaIndex } from "./dogma/index";
import { deriveShipRolePills } from "./roles";
import { estimateShipCynoChance, evaluateCynoRisk, type CynoRisk } from "./cyno";

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

type DerivedInference = {
  predictedShips: ShipPrediction[];
  fitCandidates: FitCandidate[];
  cynoRisk: CynoRisk;
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
    setPilotCards(
      params.entries.map((entry) => ({
        parsedEntry: entry,
        status: "loading",
        fetchPhase: "loading",
        predictedShips: [],
        fitCandidates: [],
        kills: [],
        losses: [],
        inferenceKills: [],
        inferenceLosses: []
      }))
    );

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

    const resolveNamesSafely = async (
      ids: number[],
      onRetry: (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => void
    ) => {
      if (ids.length === 0) {
        return new Map<number, string>();
      }
      try {
        const namesById = await resolveUniverseNames(ids, abortController.signal, onRetry("ESI names"));
        const merged = withDogmaTypeNameFallback(ids, namesById, params.dogmaIndex);
        logDebugRef.current("Universe names resolved", {
          count: namesById.size,
          dogmaBackfilled: merged.backfilledCount
        });
        return merged.namesById;
      } catch {
        const merged = withDogmaTypeNameFallback(ids, new Map<number, string>(), params.dogmaIndex);
        logDebugRef.current("Universe names resolution failed; continuing with fallbacks.", {
          dogmaBackfilled: merged.backfilledCount
        });
        return merged.namesById;
      }
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
        const stageOneNames = await resolveNamesSafely(stageOneIds, onRetry);

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
        await ensureExplicitShipTypeId(stageOneDerived.predictedShips, entry, abortController.signal, onRetry, logDebugRef.current);
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
        const stageTwoNames = await resolveNamesSafely(stageTwoIds, onRetry);
        const stageTwoRow: PilotCard = {
          ...stageOneRow,
          fetchPhase: "ready",
          corporationName: stageTwoNames.get(character.corporation_id),
          allianceName: character.alliance_id ? stageTwoNames.get(character.alliance_id) : undefined,
          inferenceKills: mergedInferenceKills,
          inferenceLosses: mergedInferenceLosses
        };
        const stageTwoDerived = await loadDerivedInference(stageTwoRow, stageTwoNames);
        await ensureExplicitShipTypeId(stageTwoDerived.predictedShips, entry, abortController.signal, onRetry, logDebugRef.current);
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

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function createErrorCard(entry: ParsedPilotInput, error: string): PilotCard {
  return {
    parsedEntry: entry,
    status: "error",
    fetchPhase: "error",
    error,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

function mergeKillmailLists(primary: ZkillKillmail[], secondary: ZkillKillmail[]): ZkillKillmail[] {
  const map = new Map<number, ZkillKillmail>();
  for (const row of [...primary, ...secondary]) {
    map.set(row.killmail_id, row);
  }
  return [...map.values()].sort((a, b) => Date.parse(b.killmail_time) - Date.parse(a.killmail_time));
}

async function ensureExplicitShipTypeId(
  predictedShips: ShipPrediction[],
  parsedEntry: ParsedPilotInput,
  signal: AbortSignal,
  onRetry: (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => void,
  logDebug: (message: string, data?: unknown) => void
): Promise<void> {
  const explicitName = parsedEntry.explicitShip?.trim();
  if (!explicitName) {
    return;
  }

  const explicitRow = predictedShips.find((row) => row.source === "explicit");
  if (!explicitRow || explicitRow.shipTypeId) {
    return;
  }

  try {
    const typeId = await resolveInventoryTypeIdByName(explicitName, signal, onRetry("ESI type search"));
    if (typeId) {
      explicitRow.shipTypeId = typeId;
      logDebug("Explicit ship type resolved via ESI search", {
        pilot: parsedEntry.pilotName,
        ship: explicitName,
        typeId
      });
    } else {
      logDebug("Explicit ship type unresolved; icon fallback will be used", {
        pilot: parsedEntry.pilotName,
        ship: explicitName
      });
    }
  } catch (error) {
    logDebug("Explicit ship type lookup failed; icon fallback will be used", {
      pilot: parsedEntry.pilotName,
      ship: explicitName,
      error: extractErrorMessage(error)
    });
  }
}

function buildDerivedInferenceKey(params: {
  characterId: number;
  lookbackDays: number;
  topShips: number;
  explicitShip?: string;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
}): string {
  const killHead = params.kills.slice(0, 8).map((k) => k.killmail_id).join(",");
  const killTail = params.kills.slice(-8).map((k) => k.killmail_id).join(",");
  const lossHead = params.losses.slice(0, 8).map((l) => l.killmail_id).join(",");
  const lossTail = params.losses.slice(-8).map((l) => l.killmail_id).join(",");
  return [
    "derived.inference.v7",
    params.characterId,
    params.lookbackDays,
    params.topShips,
    params.explicitShip ?? "-",
    params.kills.length,
    params.losses.length,
    killHead,
    killTail,
    lossHead,
    lossTail
  ].join("|");
}

async function recomputeDerivedInference(params: {
  row: PilotCard;
  settings: Settings;
  namesById: Map<number, string>;
  cacheKey: string;
  debugLog?: (message: string, data?: unknown) => void;
}): Promise<DerivedInference> {
  const evidenceCoverage = summarizeEvidenceCoverage(
    params.row.characterId!,
    params.row.inferenceKills,
    params.row.inferenceLosses
  );
  params.debugLog?.("Inference evidence coverage", {
    pilot: params.row.parsedEntry.pilotName,
    ...evidenceCoverage
  });

  const topEvidence = summarizeTopEvidenceShips({
    characterId: params.row.characterId!,
    kills: params.row.inferenceKills,
    losses: params.row.inferenceLosses,
    shipNamesByTypeId: params.namesById,
    limit: 10
  });
  params.debugLog?.("Inference top evidence ships", {
    pilot: params.row.parsedEntry.pilotName,
    ships: topEvidence
  });

  const predictedShips = deriveShipPredictions({
    parsedEntry: params.row.parsedEntry,
    characterId: params.row.characterId!,
    kills: params.row.inferenceKills,
    losses: params.row.inferenceLosses,
    lookbackDays: params.settings.lookbackDays,
    topShips: TOP_SHIP_CANDIDATES,
    shipNamesByTypeId: params.namesById
  });
  const fitCandidates = deriveFitCandidates({
    characterId: params.row.characterId!,
    losses: params.row.inferenceLosses,
    predictedShips,
    itemNamesByTypeId: params.namesById,
    onFitDebug: (fitDebug) => {
      params.debugLog?.("Fit inference source", {
        pilot: params.row.parsedEntry.pilotName,
        shipTypeId: fitDebug.shipTypeId,
        shipName: params.namesById.get(fitDebug.shipTypeId) ?? `Type ${fitDebug.shipTypeId}`,
        killmailId: fitDebug.sourceLossKillmailId,
        totalItems: fitDebug.totalItems,
        fittedFlagItems: fitDebug.fittedFlagItems,
        selectedSlots: fitDebug.selectedSlots,
        droppedAsChargeLike: fitDebug.droppedAsChargeLike
      });
    }
  });
  const cynoRisk = evaluateCynoRisk({
    predictedShips,
    characterId: params.row.characterId!,
    kills: params.row.inferenceKills,
    losses: params.row.inferenceLosses,
    namesByTypeId: params.namesById
  });
  const cynoByShip = estimateShipCynoChance({
    predictedShips,
    characterId: params.row.characterId!,
    losses: params.row.inferenceLosses,
    namesByTypeId: params.namesById
  });
  const rolePillsByShip = deriveShipRolePills({
    predictedShips,
    fitCandidates,
    losses: params.row.inferenceLosses,
    characterId: params.row.characterId!,
    namesByTypeId: params.namesById,
    onEvidence: (shipName, evidence) => {
      if (evidence.length === 0) {
        return;
      }
      params.debugLog?.("Role pill evidence", {
        pilot: params.row.parsedEntry.pilotName,
        ship: shipName,
        evidence: evidence.map((row) => ({
          role: row.role,
          source: row.source,
          moduleOrReason: row.details,
          killmailId: row.killmailId
        }))
      });
    }
  });
  const predictedShipsWithCyno = predictedShips.map((ship) => {
    const cyno = cynoByShip.get(ship.shipName);
    const rolePills = rolePillsByShip.get(ship.shipName) ?? [];
    return {
      ...ship,
      cynoCapable: cyno?.cynoCapable ?? false,
      cynoChance: cyno?.cynoChance ?? 0,
      rolePills
    };
  });

  const derived: DerivedInference = {
    predictedShips: predictedShipsWithCyno,
    fitCandidates,
    cynoRisk
  };
  params.debugLog?.("Inference ranked ships", {
    pilot: params.row.parsedEntry.pilotName,
    ranked: predictedShipsWithCyno.map((ship) => ({
      ship: ship.shipName,
      probability: ship.probability,
      source: ship.source,
      reason: ship.reason
    }))
  });
  await setCachedAsync(params.cacheKey, derived, 1000 * 60 * 15, 1000 * 60 * 5);
  return derived;
}

function isDerivedInferenceUsable(
  value: DerivedInference,
  explicitShip?: string
): boolean {
  if (!value || !Array.isArray(value.predictedShips) || !Array.isArray(value.fitCandidates) || !value.cynoRisk) {
    return false;
  }
  if (!explicitShip) {
    return true;
  }
  return value.predictedShips.some((ship) => ship.shipName === explicitShip);
}

function mergePilotStats(params: {
  derived: PilotStats;
  zkillStats: ZkillCharacterStats | null;
}): PilotStats {
  const source = params.zkillStats;
  if (!source) {
    return params.derived;
  }

  const kills = source.kills ?? params.derived.kills;
  const losses = source.losses ?? params.derived.losses;
  const solo = source.solo ?? params.derived.solo;
  const iskDestroyed = source.iskDestroyed ?? params.derived.iskDestroyed;
  const iskLost = source.iskLost ?? params.derived.iskLost;

  return {
    kills,
    losses,
    solo,
    soloRatio: kills > 0 ? Number(((solo / kills) * 100).toFixed(1)) : 0,
    iskDestroyed,
    iskLost,
    kdRatio: losses > 0 ? Number((kills / losses).toFixed(2)) : kills > 0 ? kills : 0,
    iskRatio: iskLost > 0 ? Number((iskDestroyed / iskLost).toFixed(2)) : iskDestroyed > 0 ? iskDestroyed : 0,
    danger: kills + losses > 0 ? Number(((kills / (kills + losses)) * 100).toFixed(1)) : params.derived.danger
  };
}
