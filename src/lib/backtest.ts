import type { ParsedPilotInput } from "../types";
import type { ZkillKillmail } from "./api/zkill";
import { deriveShipPredictions, type ScoringWeights } from "./intel";

export type BacktestSample = {
  parsedEntry: ParsedPilotInput;
  characterId: number;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
};

export type BacktestCandidate = {
  label: string;
  weights: ScoringWeights;
};

export type BacktestResult = {
  label: string;
  weights: ScoringWeights;
  totalSamples: number;
  hitRate: number;
};

export function tuneScoringWeights(params: {
  samples: BacktestSample[];
  candidates: BacktestCandidate[];
  lookbackDays: number;
  topN: number;
  shipNamesByTypeId: Map<number, string>;
}): { best: BacktestResult | null; results: BacktestResult[] } {
  const results: BacktestResult[] = params.candidates.map((candidate) => {
    let hits = 0;
    let total = 0;

    for (const sample of params.samples) {
      const target = extractTargetShip(sample.characterId, sample.kills, sample.losses);
      if (!target) {
        continue;
      }

      const evidence = removeTargetEvent(sample.kills, sample.losses, target.killmailId);
      const predicted = deriveShipPredictions({
        parsedEntry: sample.parsedEntry,
        characterId: sample.characterId,
        kills: evidence.kills,
        losses: evidence.losses,
        lookbackDays: params.lookbackDays,
        topShips: params.topN,
        shipNamesByTypeId: params.shipNamesByTypeId,
        weights: candidate.weights
      });

      total += 1;
      if (predicted.some((row) => row.shipTypeId === target.shipTypeId)) {
        hits += 1;
      }
    }

    return {
      label: candidate.label,
      weights: candidate.weights,
      totalSamples: total,
      hitRate: total > 0 ? Number(((hits / total) * 100).toFixed(1)) : 0
    };
  });

  results.sort((a, b) => b.hitRate - a.hitRate);
  return {
    best: results[0] ?? null,
    results
  };
}

function extractTargetShip(
  characterId: number,
  kills: ZkillKillmail[],
  losses: ZkillKillmail[]
): { shipTypeId: number; killmailId: number; occurredAt: number } | null {
  const events: Array<{ shipTypeId: number; killmailId: number; occurredAt: number }> = [];

  for (const kill of kills) {
    const attacker = kill.attackers?.find((entry) => entry.character_id === characterId);
    if (attacker?.ship_type_id) {
      events.push({
        shipTypeId: attacker.ship_type_id,
        killmailId: kill.killmail_id,
        occurredAt: Date.parse(kill.killmail_time)
      });
    }
  }

  for (const loss of losses) {
    if (loss.victim.character_id === characterId && loss.victim.ship_type_id) {
      events.push({
        shipTypeId: loss.victim.ship_type_id,
        killmailId: loss.killmail_id,
        occurredAt: Date.parse(loss.killmail_time)
      });
    }
  }

  if (events.length < 2) {
    return null;
  }
  events.sort((a, b) => b.occurredAt - a.occurredAt);
  return events[0];
}

function removeTargetEvent(
  kills: ZkillKillmail[],
  losses: ZkillKillmail[],
  killmailId: number
): { kills: ZkillKillmail[]; losses: ZkillKillmail[] } {
  return {
    kills: kills.filter((row) => row.killmail_id !== killmailId),
    losses: losses.filter((row) => row.killmail_id !== killmailId)
  };
}
