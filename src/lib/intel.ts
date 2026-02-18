import type { ParsedPilotInput } from "../types";
import type { ZkillKillmail } from "./api/zkill";
import type { FitResolvedSlots } from "./dogma/types";
import { collectEvidence } from "./intel/evidence";
import { deriveFitCandidates as deriveFitCandidatesFromLosses } from "./intel/fits";
import {
  findMatchingShipTypeIdByName,
  mapScoredShipsToPredictions,
  scoreShips
} from "./intel/prediction";
import {
  summarizeEvidenceCoverage as summarizeEvidenceCoverageFromEvidence,
  summarizeTopEvidenceShips as summarizeTopEvidenceShipsFromEvidence
} from "./intel/summaries";

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
  modulesBySlot?: FitResolvedSlots;
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
  avgGangSize?: number;
  gangRatio?: number;
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

  const soloRatio = ratioPercent(soloKills, killsCount);
  return {
    kills: killsCount,
    losses: lossesCount,
    kdRatio: ratio(killsCount, lossesCount),
    solo: soloKills,
    soloRatio,
    gangRatio: Number((100 - soloRatio).toFixed(1)),
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
  return mapScoredShipsToPredictions({
    scoredShips: scored,
    parsedEntry: params.parsedEntry,
    topShips: params.topShips,
    shipNamesByTypeId: params.shipNamesByTypeId
  });
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
  onFitDebug?: (entry: {
    shipTypeId: number;
    sourceLossKillmailId: number;
    totalItems: number;
    fittedFlagItems: number;
    selectedSlots: number;
    droppedAsChargeLike: number;
  }) => void;
}): FitCandidate[] {
  return deriveFitCandidatesFromLosses(params);
}

export function summarizeEvidenceCoverage(
  characterId: number,
  kills: ZkillKillmail[],
  losses: ZkillKillmail[]
): EvidenceCoverage {
  return summarizeEvidenceCoverageFromEvidence(characterId, kills, losses);
}

export function summarizeTopEvidenceShips(params: {
  characterId: number;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  shipNamesByTypeId: Map<number, string>;
  limit?: number;
}): Array<{ shipTypeId: number; shipName: string; kills: number; losses: number; total: number }> {
  return summarizeTopEvidenceShipsFromEvidence(params);
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
