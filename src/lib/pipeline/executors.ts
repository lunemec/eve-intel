import type { ParsedPilotInput, Settings } from "../../types";
import { resolveInventoryTypeIdByName } from "../api/esi";
import { setCachedAsync } from "../cache";
import { formatFitAsEft } from "../eft";
import { persistDevFitRecord } from "../devFitDump";
import {
  deriveFitCandidates,
  deriveShipPredictions,
  summarizeEvidenceCoverage,
  summarizeTopEvidenceShips,
  type ShipPrediction
} from "../intel";
import type { PilotCard } from "../usePilotIntelPipeline";
import { estimateShipCynoChance, evaluateCynoRisk, type CynoRisk } from "../cyno";
import { deriveShipRolePills } from "../roles";
import { TOP_SHIP_CANDIDATES } from "./constants";
import { DEV_FIT_DUMP_ENABLED } from "./constants";
import type { DebugLogger, PipelineSignal, RetryBuilder } from "./types";

export type DerivedInference = {
  predictedShips: ShipPrediction[];
  fitCandidates: ReturnType<typeof deriveFitCandidates>;
  cynoRisk: CynoRisk;
};

export async function ensureExplicitShipTypeId(params: {
  predictedShips: ShipPrediction[];
  parsedEntry: ParsedPilotInput;
  signal: PipelineSignal;
  onRetry: RetryBuilder;
  logDebug: DebugLogger;
}): Promise<void> {
  const explicitName = params.parsedEntry.explicitShip?.trim();
  if (!explicitName) {
    return;
  }

  const explicitRow = params.predictedShips.find((row) => row.source === "explicit");
  if (!explicitRow || explicitRow.shipTypeId) {
    return;
  }

  try {
    const typeId = await resolveInventoryTypeIdByName(explicitName, params.signal, params.onRetry("ESI type search"));
    if (typeId) {
      explicitRow.shipTypeId = typeId;
      params.logDebug("Explicit ship type resolved via ESI search", {
        pilot: params.parsedEntry.pilotName,
        ship: explicitName,
        typeId
      });
    } else {
      params.logDebug("Explicit ship type unresolved; icon fallback will be used", {
        pilot: params.parsedEntry.pilotName,
        ship: explicitName
      });
    }
  } catch (error) {
    params.logDebug("Explicit ship type lookup failed; icon fallback will be used", {
      pilot: params.parsedEntry.pilotName,
      ship: explicitName,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function recomputeDerivedInference(params: {
  row: PilotCard;
  settings: Settings;
  namesById: Map<number, string>;
  cacheKey: string;
  debugLog?: DebugLogger;
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
  if (DEV_FIT_DUMP_ENABLED()) {
    await persistDerivedFitsForDev({
      fitCandidates,
      predictedShips,
      namesById: params.namesById,
      pilotName: params.row.parsedEntry.pilotName,
      debugLog: params.debugLog
    });
  }
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

async function persistDerivedFitsForDev(params: {
  fitCandidates: ReturnType<typeof deriveFitCandidates>;
  predictedShips: ShipPrediction[];
  namesById: Map<number, string>;
  pilotName: string;
  debugLog?: DebugLogger;
}): Promise<void> {
  const shipNameByTypeId = new Map<number, string>();
  for (const predicted of params.predictedShips) {
    if (predicted.shipTypeId) {
      shipNameByTypeId.set(predicted.shipTypeId, predicted.shipName);
    }
  }

  const writes = params.fitCandidates
    .filter((fit) => fit.shipTypeId && fit.eftSections)
    .map(async (fit) => {
      const shipName =
        shipNameByTypeId.get(fit.shipTypeId) ??
        params.namesById.get(fit.shipTypeId) ??
        `Type ${fit.shipTypeId}`;
      const eft = formatFitAsEft(shipName, fit);
      try {
        const stored = await persistDevFitRecord({
          shipName,
          shipTypeId: fit.shipTypeId,
          eft,
          sourceLossKillmailId: fit.sourceLossKillmailId
        });
        if (stored) {
          params.debugLog?.("Dev fit dump persisted", {
            pilot: params.pilotName,
            shipTypeId: fit.shipTypeId,
            shipName
          });
        }
      } catch (error) {
        params.debugLog?.("Dev fit dump persistence failed", {
          pilot: params.pilotName,
          shipTypeId: fit.shipTypeId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

  await Promise.all(writes);
}
