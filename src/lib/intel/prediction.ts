import type { ScoringWeights, ShipPrediction } from "../intel";
import type { ParsedPilotInput } from "../../types";
import type { Evidence } from "./evidence";

type ScoredShip = {
  shipTypeId?: number;
  score: number;
  source: "explicit" | "inferred";
  reason: string[];
};

const DEFAULT_WEIGHTS: Required<Pick<ScoringWeights, "longTailWeight" | "longTailDays">> = {
  longTailWeight: 0.2,
  longTailDays: 30
};
const MIN_RECENCY_WEIGHT = 1e-6;
const CAPSULE_TYPE_IDS = new Set([670, 33328]);
const NON_SHIP_NAME_KEYWORDS = [
  "mobile",
  "warp disruptor",
  "depot",
  "tractor unit",
  "siphon",
  "control tower",
  "starbase",
  "cynosural generator",
  "jump bridge",
  "station",
  "citadel",
  "engineering complex",
  "refinery",
  "customs office",
  "infrastructure hub",
  "territorial claim unit",
  "sovereignty blockade unit",
  "array",
  "battery",
  "silo",
  "laboratory"
];

export function scoreShips(
  evidence: Evidence[],
  lookbackDays: number,
  explicitShip: string | undefined,
  weights: ScoringWeights
): ScoredShip[] {
  const byShip = new Map<number, { score: number; kills: number; losses: number }>();
  const now = Date.now();
  const longTailWeight: number = weights.longTailWeight ?? DEFAULT_WEIGHTS.longTailWeight;
  const longTailDays = Math.max(1, weights.longTailDays ?? DEFAULT_WEIGHTS.longTailDays);

  for (const ev of evidence) {
    const ageMs = Math.max(0, now - ev.occurredAt);
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyRaw = Math.exp(-ageDays / Math.max(1, lookbackDays / Math.max(1, weights.halfLifeDivisor)));
    const recency = Math.max(MIN_RECENCY_WEIGHT, recencyRaw);
    const longTail = 1 / (1 + ageDays / longTailDays);
    const eventWeight = ev.eventType === "loss" ? weights.lossEventWeight : 1.0;
    const increment = eventWeight * (recency + longTailWeight * longTail);

    const current = byShip.get(ev.shipTypeId) ?? { score: 0, kills: 0, losses: 0 };
    current.score += increment;
    if (ev.eventType === "kill") {
      current.kills += 1;
    } else {
      current.losses += 1;
    }
    byShip.set(ev.shipTypeId, current);
  }

  const inferred: ScoredShip[] = [...byShip.entries()].map(([shipTypeId, data]) => ({
    shipTypeId,
    score: data.score,
    source: "inferred",
    reason: [`freq:${data.kills + data.losses}`, `kills:${data.kills}`, `losses:${data.losses}`]
  }));

  inferred.sort((a, b) => b.score - a.score);
  return normalize(applyExplicitOverride(inferred, explicitShip));
}

export function findMatchingShipTypeIdByName(
  evidence: Evidence[],
  shipNamesByTypeId: Map<number, string>,
  explicitShipLower: string
): number | undefined {
  const seen = new Set<number>();
  for (const ev of evidence) {
    if (seen.has(ev.shipTypeId)) {
      continue;
    }
    seen.add(ev.shipTypeId);
    const candidate = shipNamesByTypeId.get(ev.shipTypeId)?.trim().toLowerCase();
    if (candidate === explicitShipLower) {
      return ev.shipTypeId;
    }
  }
  return undefined;
}

export function isCapsuleCandidate(shipTypeId: number | undefined, shipNamesByTypeId: Map<number, string>): boolean {
  if (!shipTypeId) {
    return false;
  }
  if (CAPSULE_TYPE_IDS.has(shipTypeId)) {
    return true;
  }
  const name = shipNamesByTypeId.get(shipTypeId)?.toLowerCase() ?? "";
  return name.includes("capsule") || name === "pod";
}

export function isNonShipCandidate(shipTypeId: number | undefined, shipNamesByTypeId: Map<number, string>): boolean {
  if (!shipTypeId) {
    return false;
  }
  const name = shipNamesByTypeId.get(shipTypeId)?.toLowerCase().trim() ?? "";
  if (!name) {
    return false;
  }
  return NON_SHIP_NAME_KEYWORDS.some((keyword) => name.includes(keyword));
}

export function renormalizeProbabilities(predictions: ShipPrediction[]): ShipPrediction[] {
  if (predictions.length === 0) {
    return predictions;
  }
  const total = predictions.reduce((acc, row) => acc + row.probability, 0);
  if (total <= 0) {
    return predictions;
  }
  return predictions.map((row) => ({
    ...row,
    probability: Number(((row.probability / total) * 100).toFixed(1))
  }));
}

export function mapScoredShipsToPredictions(params: {
  scoredShips: ScoredShip[];
  parsedEntry: ParsedPilotInput;
  topShips: number;
  shipNamesByTypeId: Map<number, string>;
}): ShipPrediction[] {
  const withoutCapsules = params.scoredShips.filter((entry) => {
    if (entry.source === "explicit") {
      return true;
    }
    return (
      !isCapsuleCandidate(entry.shipTypeId, params.shipNamesByTypeId) &&
      !isNonShipCandidate(entry.shipTypeId, params.shipNamesByTypeId)
    );
  });
  const top = withoutCapsules.slice(0, Math.max(1, params.topShips));

  const mapped = top
    .map((entry) => {
      const shipName =
        entry.source === "explicit"
          ? params.parsedEntry.explicitShip ?? "Unknown Ship"
          : entry.shipTypeId
            ? params.shipNamesByTypeId.get(entry.shipTypeId) ?? `Type ${entry.shipTypeId}`
            : "Unknown Ship";

      return {
        shipTypeId: entry.shipTypeId,
        shipName,
        probability: entry.score,
        source: entry.source,
        reason: entry.reason
      };
    })
    .filter((entry) => entry.probability > 0);

  return renormalizeProbabilities(mapped);
}

function applyExplicitOverride(inferred: ScoredShip[], explicitShip?: string): ScoredShip[] {
  if (!explicitShip) {
    return inferred;
  }

  const explicit: ScoredShip = {
    shipTypeId: undefined,
    score: inferred.length > 0 ? inferred[0].score + 1 : 1,
    source: "explicit",
    reason: ["explicit paste"]
  };

  return [explicit, ...inferred];
}

function normalize(input: ScoredShip[]): ScoredShip[] {
  const total = input.reduce((acc, item) => acc + item.score, 0);
  if (total <= 0) {
    return input;
  }
  const normalized = input.map((item) => ({
    ...item,
    score: Number(((item.score / total) * 100).toFixed(1))
  }));
  normalized.sort((a, b) => b.score - a.score);
  return normalized;
}
