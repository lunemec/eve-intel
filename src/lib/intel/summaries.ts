import type { ZkillKillmail } from "../api/zkill";
import type { EvidenceCoverage } from "../intel";
import { collectEvidence } from "./evidence";

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
