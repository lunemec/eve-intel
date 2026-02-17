import type { DogmaIndex } from "./dogma/index";
import { calculateShipCombatMetrics, type CalculateCombatMetricsInput } from "./dogma/calc";
import type { CombatMetrics } from "./dogma/types";
import type { FitCandidate } from "./intel";
import type { PilotCard } from "./usePilotIntelPipeline";

export type FitMetricResult =
  | { status: "ready"; key: string; value: CombatMetrics }
  | { status: "unavailable"; key: string; reason: string };

export function createFitMetricsResolver(params: {
  dogmaIndex: DogmaIndex | null;
  logDebug: (message: string, data?: unknown) => void;
}): (pilot: PilotCard, fit: FitCandidate | undefined) => FitMetricResult {
  const cache = new Map<string, FitMetricResult>();
  const loggedKeys = new Set<string>();

  return (pilot: PilotCard, fit: FitCandidate | undefined): FitMetricResult => {
    if (!fit?.modulesBySlot || !fit.shipTypeId) {
      return { status: "unavailable", key: "none", reason: "No resolved fit modules available." };
    }

    const key = buildFitMetricKey(pilot.characterId, fit);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    if (!params.dogmaIndex) {
      const missing = {
        status: "unavailable" as const,
        key,
        reason: "Dogma pack not loaded yet."
      };
      cache.set(key, missing);
      return missing;
    }

    try {
      const totalSlots = countFitModules(fit.modulesBySlot);
      const resolvedSlots = countResolvedFitModules(fit.modulesBySlot);
      const resolvedRatio = totalSlots > 0 ? resolvedSlots / totalSlots : 0;

      const input: CalculateCombatMetricsInput = {
        shipTypeId: fit.shipTypeId,
        slots: fit.modulesBySlot,
        drones: fit.modulesBySlot.other
      };
      const value = calculateShipCombatMetrics(params.dogmaIndex, input);
      const result: FitMetricResult = { status: "ready", key, value };
      cache.set(key, result);

      if (!loggedKeys.has(key)) {
        loggedKeys.add(key);
        params.logDebug("Fit resolution summary", {
          pilot: pilot.parsedEntry.pilotName,
          shipTypeId: fit.shipTypeId,
          fitLabel: fit.fitLabel,
          resolvedModules: resolvedSlots,
          totalModules: totalSlots,
          resolvedRatio: Number((resolvedRatio * 100).toFixed(1))
        });
        params.logDebug("Calculator assumptions", {
          pilot: pilot.parsedEntry.pilotName,
          shipTypeId: fit.shipTypeId,
          assumptions: value.assumptions
        });
        params.logDebug("Confidence score breakdown", {
          pilot: pilot.parsedEntry.pilotName,
          shipTypeId: fit.shipTypeId,
          confidence: value.confidence,
          assumptionCount: value.assumptions.length
        });
      }
      return result;
    } catch (error) {
      const reason = extractErrorMessage(error);
      const failed = { status: "unavailable" as const, key, reason: `Combat calculator failed: ${reason}` };
      cache.set(key, failed);
      params.logDebug("Combat calculator failure", {
        pilot: pilot.parsedEntry.pilotName,
        fitSignature: key,
        error: reason
      });
      return failed;
    }
  };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function buildFitMetricKey(characterId: number | undefined, fit: FitCandidate): string {
  const modules = fit.modulesBySlot
    ? [
        ...fit.modulesBySlot.high,
        ...fit.modulesBySlot.mid,
        ...fit.modulesBySlot.low,
        ...fit.modulesBySlot.rig,
        ...fit.modulesBySlot.other
      ]
        .map((row) => row.typeId)
        .sort((a, b) => a - b)
        .join(",")
    : "none";
  return [characterId ?? "unknown", fit.shipTypeId, fit.fitLabel, modules].join("|");
}

function countFitModules(slots: NonNullable<FitCandidate["modulesBySlot"]>): number {
  return slots.high.length + slots.mid.length + slots.low.length + slots.rig.length + slots.other.length;
}

function countResolvedFitModules(slots: NonNullable<FitCandidate["modulesBySlot"]>): number {
  return [...slots.high, ...slots.mid, ...slots.low, ...slots.rig, ...slots.other].filter((row) =>
    Number.isFinite(row.typeId)
  ).length;
}
