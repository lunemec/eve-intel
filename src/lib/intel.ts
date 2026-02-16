import type { ParsedPilotInput } from "../types";
import type { ZkillKillmail } from "./api/zkill";

export type ShipPrediction = {
  shipTypeId?: number;
  shipName: string;
  probability: number;
  source: "explicit" | "inferred";
  reason: string[];
  cynoCapable?: boolean;
  cynoChance?: number;
  rolePills?: string[];
};

export type FitCandidate = {
  shipTypeId: number;
  fitLabel: string;
  confidence: number;
  eftSections?: FitEftSections;
  sourceLossKillmailId?: number;
  alternates: Array<{
    fitLabel: string;
    confidence: number;
  }>;
};

export type FitEftSections = {
  high: string[];
  mid: string[];
  low: string[];
  rig: string[];
  cargo: string[];
  other: string[];
};

export type PilotStats = {
  kills: number;
  losses: number;
  kdRatio: number;
  solo: number;
  soloRatio: number;
  iskDestroyed: number;
  iskLost: number;
  iskRatio: number;
  danger: number;
};

export type ScoringWeights = {
  lossEventWeight: number;
  halfLifeDivisor: number;
  longTailWeight?: number;
  longTailDays?: number;
};

const DEFAULT_WEIGHTS: ScoringWeights = {
  lossEventWeight: 1.0,
  halfLifeDivisor: 2,
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

type Evidence = {
  shipTypeId: number;
  occurredAt: number;
  eventType: "kill" | "loss";
};

type ScoredShip = {
  shipTypeId?: number;
  score: number;
  source: "explicit" | "inferred";
  reason: string[];
};

export type EvidenceCoverage = {
  totalKills: number;
  totalLosses: number;
  killRowsWithMatchedAttackerShip: number;
  killRowsWithoutAttackers: number;
  killRowsWithAttackersButNoCharacterMatch: number;
  lossRowsWithVictimShip: number;
};

export function derivePilotStats(
  characterId: number,
  kills: ZkillKillmail[],
  losses: ZkillKillmail[]
): PilotStats {
  const killsCount = kills.length;
  const lossesCount = losses.length;
  const soloKills = kills.filter((kill) => isSoloKill(kill, characterId)).length;
  const iskDestroyed = sumIsk(kills);
  const iskLost = sumIsk(losses);

  return {
    kills: killsCount,
    losses: lossesCount,
    kdRatio: ratio(killsCount, lossesCount),
    solo: soloKills,
    soloRatio: ratioPercent(soloKills, killsCount),
    iskDestroyed,
    iskLost,
    iskRatio: ratio(iskDestroyed, iskLost),
    danger: ratioPercent(killsCount, killsCount + lossesCount)
  };
}

export function deriveShipPredictions(params: {
  parsedEntry: ParsedPilotInput;
  characterId: number;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  lookbackDays: number;
  topShips: number;
  shipNamesByTypeId: Map<number, string>;
  weights?: ScoringWeights;
}): ShipPrediction[] {
  const evidence = collectEvidence(params.characterId, params.kills, params.losses);
  const explicitShip = params.parsedEntry.explicitShip?.trim();
  if (explicitShip) {
    const explicitShipLower = explicitShip.toLowerCase();
    const matchedTypeId = findMatchingShipTypeIdByName(evidence, params.shipNamesByTypeId, explicitShipLower);
    const matchedName = matchedTypeId ? params.shipNamesByTypeId.get(matchedTypeId) : undefined;
    return [
      {
        shipTypeId: matchedTypeId,
        shipName: matchedName ?? explicitShip,
        probability: 100,
        source: "explicit",
        reason: ["explicit paste", matchedTypeId ? "matched inferred ship type" : "name-only explicit"]
      }
    ];
  }

  const scored = scoreShips(
    evidence,
    params.lookbackDays,
    params.parsedEntry.explicitShip,
    params.weights ?? DEFAULT_WEIGHTS
  );
  const withoutCapsules = scored.filter((entry) => {
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

export function collectShipTypeIdsForNaming(kills: ZkillKillmail[], losses: ZkillKillmail[], characterId: number): number[] {
  const ids = new Set<number>();
  for (const ev of collectEvidence(characterId, kills, losses)) {
    ids.add(ev.shipTypeId);
  }
  return [...ids];
}

export function collectItemTypeIds(losses: ZkillKillmail[]): number[] {
  const ids = new Set<number>();
  for (const loss of losses) {
    for (const item of loss.victim.items ?? []) {
      ids.add(item.item_type_id);
    }
  }
  return [...ids];
}

export function deriveFitCandidates(params: {
  characterId: number;
  losses: ZkillKillmail[];
  predictedShips: ShipPrediction[];
  itemNamesByTypeId: Map<number, string>;
}): FitCandidate[] {
  const byShip = new Map<number, Map<string, {
    count: number;
    sections: FitEftSections;
    label: string;
    sourceLossKillmailId?: number;
  }>>();

  for (const ship of params.predictedShips) {
    if (!ship.shipTypeId) {
      continue;
    }
    byShip.set(
      ship.shipTypeId,
      new Map<string, { count: number; sections: FitEftSections; label: string; sourceLossKillmailId?: number }>()
    );
  }

  for (const loss of params.losses) {
    const shipTypeId = loss.victim.ship_type_id;
    if (!shipTypeId || loss.victim.character_id !== params.characterId || !byShip.has(shipTypeId)) {
      continue;
    }

    const items = (loss.victim.items ?? []).slice(0, 20);
    if (items.length === 0) {
      continue;
    }

    const sections = buildEftSections(items, params.itemNamesByTypeId);
    const moduleTokens = flattenSections(sections).slice(0, 12);
    if (moduleTokens.length === 0) {
      continue;
    }
    const signature = moduleTokens
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .join(" | ");
    const label = moduleTokens.slice(0, 4).join(" | ");
    const shipFits = byShip.get(shipTypeId)!;
    const current = shipFits.get(signature);
    if (current) {
      current.count += 1;
      shipFits.set(signature, current);
    } else {
      shipFits.set(signature, { count: 1, sections, label, sourceLossKillmailId: loss.killmail_id });
    }
  }

  const fits: FitCandidate[] = [];
  for (const [shipTypeId, signatures] of byShip.entries()) {
    const total = [...signatures.values()].reduce((acc, value) => acc + value.count, 0);
    if (total <= 0) {
      continue;
    }
    const ranked = [...signatures.values()].sort((a, b) => b.count - a.count);
    const best = ranked[0];
    const alternates = ranked.slice(1, 3).map((entry) => ({
      fitLabel: entry.label,
      confidence: Number(((entry.count / total) * 100).toFixed(1))
    }));
    fits.push({
      shipTypeId,
      fitLabel: best.label,
      confidence: Number(((best.count / total) * 100).toFixed(1)),
      eftSections: best.sections,
      sourceLossKillmailId: best.sourceLossKillmailId,
      alternates
    });
  }

  return fits;
}

export function summarizeEvidenceCoverage(
  characterId: number,
  kills: ZkillKillmail[],
  losses: ZkillKillmail[]
): EvidenceCoverage {
  let killRowsWithMatchedAttackerShip = 0;
  let killRowsWithoutAttackers = 0;
  let killRowsWithAttackersButNoCharacterMatch = 0;

  for (const kill of kills) {
    const attackers = kill.attackers ?? [];
    if (attackers.length === 0) {
      killRowsWithoutAttackers += 1;
      continue;
    }
    const matched = attackers.find(
      (entry) => entry.character_id === characterId && typeof entry.ship_type_id === "number"
    );
    if (matched) {
      killRowsWithMatchedAttackerShip += 1;
    } else {
      killRowsWithAttackersButNoCharacterMatch += 1;
    }
  }

  let lossRowsWithVictimShip = 0;
  for (const loss of losses) {
    if (
      (loss.victim.character_id === characterId || loss.victim.character_id === undefined) &&
      typeof loss.victim.ship_type_id === "number"
    ) {
      lossRowsWithVictimShip += 1;
    }
  }

  return {
    totalKills: kills.length,
    totalLosses: losses.length,
    killRowsWithMatchedAttackerShip,
    killRowsWithoutAttackers,
    killRowsWithAttackersButNoCharacterMatch,
    lossRowsWithVictimShip
  };
}

export function summarizeTopEvidenceShips(params: {
  characterId: number;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  shipNamesByTypeId: Map<number, string>;
  limit?: number;
}): Array<{ shipTypeId: number; shipName: string; kills: number; losses: number; total: number }> {
  const bucket = new Map<number, { kills: number; losses: number }>();
  for (const ev of collectEvidence(params.characterId, params.kills, params.losses)) {
    const current = bucket.get(ev.shipTypeId) ?? { kills: 0, losses: 0 };
    if (ev.eventType === "kill") {
      current.kills += 1;
    } else {
      current.losses += 1;
    }
    bucket.set(ev.shipTypeId, current);
  }

  return [...bucket.entries()]
    .map(([shipTypeId, counts]) => ({
      shipTypeId,
      shipName: params.shipNamesByTypeId.get(shipTypeId) ?? `Type ${shipTypeId}`,
      kills: counts.kills,
      losses: counts.losses,
      total: counts.kills + counts.losses
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, Math.max(1, params.limit ?? 8));
}

function buildEftSections(
  items: Array<{ item_type_id: number; flag?: number }>,
  namesByTypeId: Map<number, string>
): FitEftSections {
  const sections: FitEftSections = {
    high: [],
    mid: [],
    low: [],
    rig: [],
    cargo: [],
    other: []
  };

  for (const item of items) {
    const moduleName = namesByTypeId.get(item.item_type_id) ?? `Type ${item.item_type_id}`;
    const slot = slotFromFlag(item.flag);
    sections[slot].push(moduleName);
  }

  return {
    high: sortAlpha(sections.high),
    mid: sortAlpha(sections.mid),
    low: sortAlpha(sections.low),
    rig: sortAlpha(sections.rig),
    cargo: sortAlpha(sections.cargo),
    other: sortAlpha(sections.other)
  };
}

function flattenSections(sections: FitEftSections): string[] {
  return [
    ...sections.high,
    ...sections.mid,
    ...sections.low,
    ...sections.rig,
    ...sections.cargo,
    ...sections.other
  ];
}

function slotFromFlag(flag?: number): keyof FitEftSections {
  if (flag === undefined) {
    return "other";
  }
  if (flag >= 27 && flag <= 34) {
    return "high";
  }
  if (flag >= 19 && flag <= 26) {
    return "mid";
  }
  if (flag >= 11 && flag <= 18) {
    return "low";
  }
  if (flag >= 92 && flag <= 99) {
    return "rig";
  }
  if (flag === 5) {
    return "cargo";
  }
  return "other";
}

function sortAlpha(values: string[]): string[] {
  return values.slice().sort((a, b) => a.localeCompare(b));
}

function scoreShips(
  evidence: Evidence[],
  lookbackDays: number,
  explicitShip: string | undefined,
  weights: ScoringWeights
): ScoredShip[] {
  const byShip = new Map<number, { score: number; kills: number; losses: number }>();
  const now = Date.now();
  const longTailWeight: number = weights.longTailWeight ?? DEFAULT_WEIGHTS.longTailWeight ?? 0.2;
  const longTailDays = Math.max(1, weights.longTailDays ?? DEFAULT_WEIGHTS.longTailDays ?? 30);

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
    reason: [
      `freq:${data.kills + data.losses}`,
      `kills:${data.kills}`,
      `losses:${data.losses}`
    ]
  }));

  inferred.sort((a, b) => b.score - a.score);

  const withExplicit = applyExplicitOverride(inferred, explicitShip);
  return normalize(withExplicit);
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

function collectEvidence(characterId: number, kills: ZkillKillmail[], losses: ZkillKillmail[]): Evidence[] {
  const evidence: Evidence[] = [];

  for (const kill of kills) {
    const attacker = kill.attackers?.find((entry) => entry.character_id === characterId);
    if (attacker?.ship_type_id) {
      evidence.push({
        shipTypeId: attacker.ship_type_id,
        occurredAt: Date.parse(kill.killmail_time),
        eventType: "kill"
      });
    }
  }

  for (const loss of losses) {
    // zKill list payloads can omit victim.character_id even on character-scoped endpoints.
    // Since this list is already filtered by character ID upstream, treat missing victim ID as a match.
    if ((loss.victim.character_id === characterId || loss.victim.character_id === undefined) && loss.victim.ship_type_id) {
      evidence.push({
        shipTypeId: loss.victim.ship_type_id,
        occurredAt: Date.parse(loss.killmail_time),
        eventType: "loss"
      });
    }
  }

  return evidence;
}

function isSoloKill(kill: ZkillKillmail, characterId: number): boolean {
  if (!kill.attackers || kill.attackers.length !== 1) {
    return false;
  }
  return kill.attackers[0].character_id === characterId;
}

function sumIsk(events: ZkillKillmail[]): number {
  return events.reduce((acc, event) => acc + (event.zkb?.totalValue ?? 0), 0);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return numerator > 0 ? numerator : 0;
  }
  return Number((numerator / denominator).toFixed(2));
}

function ratioPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function findMatchingShipTypeIdByName(
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

function isCapsuleCandidate(shipTypeId: number | undefined, shipNamesByTypeId: Map<number, string>): boolean {
  if (!shipTypeId) {
    return false;
  }
  if (CAPSULE_TYPE_IDS.has(shipTypeId)) {
    return true;
  }
  const name = shipNamesByTypeId.get(shipTypeId)?.toLowerCase() ?? "";
  return name.includes("capsule") || name === "pod";
}

function isNonShipCandidate(shipTypeId: number | undefined, shipNamesByTypeId: Map<number, string>): boolean {
  if (!shipTypeId) {
    return false;
  }
  const name = shipNamesByTypeId.get(shipTypeId)?.toLowerCase().trim() ?? "";
  if (!name) {
    return false;
  }
  return NON_SHIP_NAME_KEYWORDS.some((keyword) => name.includes(keyword));
}

function renormalizeProbabilities(predictions: ShipPrediction[]): ShipPrediction[] {
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
