import type { ZkillKillmail } from "../api/zkill";
import type { EvidenceCoverage } from "../intel";

type ShipEvidenceCounts = {
  kills: number;
  losses: number;
};

export type TopEvidenceShip = {
  shipTypeId: number;
  shipName: string;
  kills: number;
  losses: number;
  total: number;
};

export type EvidenceSummary = {
  coverage: EvidenceCoverage;
  topShips: TopEvidenceShip[];
};

function scanEvidenceRows(
  characterId: number,
  kills: ZkillKillmail[],
  losses: ZkillKillmail[]
): { coverage: EvidenceCoverage; shipCounts: Map<number, ShipEvidenceCounts> } {
  const shipCounts = new Map<number, ShipEvidenceCounts>();
  let killRowsWithMatchedAttackerShip = 0;
  let killRowsWithoutAttackers = 0;
  let killRowsWithAttackersButNoCharacterMatch = 0;

  for (const kill of kills) {
    const attackers = kill.attackers ?? [];
    if (attackers.length === 0) {
      killRowsWithoutAttackers += 1;
      continue;
    }

    let sawCharacterMatch = false;
    let firstCharacterMatchShipTypeId: number | undefined;
    let hasCoverageMatch = false;
    for (const attacker of attackers) {
      if (attacker.character_id !== characterId) {
        continue;
      }
      if (!sawCharacterMatch) {
        sawCharacterMatch = true;
        firstCharacterMatchShipTypeId = attacker.ship_type_id;
      }
      if (!hasCoverageMatch && typeof attacker.ship_type_id === "number") {
        hasCoverageMatch = true;
      }
      if (sawCharacterMatch && hasCoverageMatch) {
        break;
      }
    }

    if (hasCoverageMatch) {
      killRowsWithMatchedAttackerShip += 1;
    } else {
      killRowsWithAttackersButNoCharacterMatch += 1;
    }

    if (firstCharacterMatchShipTypeId) {
      incrementShipCounts(shipCounts, firstCharacterMatchShipTypeId, "kills");
    }
  }

  let lossRowsWithVictimShip = 0;
  for (const loss of losses) {
    const matchedCharacter = loss.victim.character_id === characterId || loss.victim.character_id === undefined;
    const victimShipTypeId = loss.victim.ship_type_id;
    if (matchedCharacter && typeof victimShipTypeId === "number") {
      lossRowsWithVictimShip += 1;
    }
    if (matchedCharacter && victimShipTypeId) {
      incrementShipCounts(shipCounts, victimShipTypeId, "losses");
    }
  }

  return {
    coverage: {
      totalKills: kills.length,
      totalLosses: losses.length,
      killRowsWithMatchedAttackerShip,
      killRowsWithoutAttackers,
      killRowsWithAttackersButNoCharacterMatch,
      lossRowsWithVictimShip
    },
    shipCounts
  };
}

function incrementShipCounts(
  shipCounts: Map<number, ShipEvidenceCounts>,
  shipTypeId: number,
  key: keyof ShipEvidenceCounts
): void {
  const current = shipCounts.get(shipTypeId) ?? { kills: 0, losses: 0 };
  current[key] += 1;
  shipCounts.set(shipTypeId, current);
}

function buildTopEvidenceShips(params: {
  shipCounts: Map<number, ShipEvidenceCounts>;
  shipNamesByTypeId: Map<number, string>;
  limit?: number;
}): TopEvidenceShip[] {
  return [...params.shipCounts.entries()]
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

export function summarizeEvidenceCoverage(
  characterId: number,
  kills: ZkillKillmail[],
  losses: ZkillKillmail[]
): EvidenceCoverage {
  return scanEvidenceRows(characterId, kills, losses).coverage;
}

export function summarizeTopEvidenceShips(params: {
  characterId: number;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  shipNamesByTypeId: Map<number, string>;
  limit?: number;
}): TopEvidenceShip[] {
  const scan = scanEvidenceRows(params.characterId, params.kills, params.losses);
  return buildTopEvidenceShips({
    shipCounts: scan.shipCounts,
    shipNamesByTypeId: params.shipNamesByTypeId,
    limit: params.limit
  });
}

export function summarizeEvidence(params: {
  characterId: number;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  shipNamesByTypeId: Map<number, string>;
  limit?: number;
}): EvidenceSummary {
  const scan = scanEvidenceRows(params.characterId, params.kills, params.losses);
  return {
    coverage: scan.coverage,
    topShips: buildTopEvidenceShips({
      shipCounts: scan.shipCounts,
      shipNamesByTypeId: params.shipNamesByTypeId,
      limit: params.limit
    })
  };
}
