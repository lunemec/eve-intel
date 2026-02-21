import type { FitCandidate, ShipPrediction } from "./intel";
import type { ZkillKillmail } from "./api/zkill";
import { killmailZkillUrl } from "./links";
import {
  selectMostRecentPillEvidence,
  type PillEvidenceByName,
  type PillEvidenceCandidate
} from "./pillEvidence";

export type CynoRisk = {
  potentialCyno: boolean;
  jumpAssociation: boolean;
  reasons: string[];
};

export type ShipCynoChance = {
  cynoCapable: boolean;
  cynoChance: number;
};

type LossCynoStats = {
  total: number;
  cyno: number;
};

export function deriveShipCynoBaitEvidence(params: {
  predictedShips: ShipPrediction[];
  fitCandidates: FitCandidate[];
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  characterId: number;
  namesByTypeId: Map<number, string>;
}): Map<string, PillEvidenceByName> {
  const out = new Map<string, PillEvidenceByName>();
  const pilotWideBaitKills = collectPilotWideBaitKills(params.kills, params.characterId, params.namesByTypeId);

  for (const ship of params.predictedShips) {
    const fitId = resolveFitId(ship, params.fitCandidates);
    const candidatesByPill = collectShipCynoBaitCandidates(ship, fitId, pilotWideBaitKills, params);
    const selectedCyno = selectMostRecentPillEvidence(candidatesByPill.cyno);
    const selectedBait = selectMostRecentPillEvidence(candidatesByPill.bait);

    if (!selectedCyno && !selectedBait) {
      continue;
    }

    const evidence: PillEvidenceByName = {};
    if (selectedCyno) {
      evidence.Cyno = selectedCyno;
    }
    if (selectedBait) {
      evidence.Bait = selectedBait;
    }
    out.set(ship.shipName, evidence);
  }

  return out;
}

const COVERT_OR_CYNO_SHIPS = new Set<string>([
  // Force Recon
  "Arazu",
  "Lachesis",
  "Pilgrim",
  "Curse",
  "Falcon",
  "Rook",
  "Rapier",
  "Huginn",
  // Black Ops
  "Widow",
  "Sin",
  "Redeemer",
  "Panther",
  // Special hull
  "Marshal",
  "Etana",
  // Blockade runners
  "Prowler",
  "Prorator",
  "Crane",
  "Viator",
  // Tech I haulers / industrials (industrial cyno capable)
  "Badger",
  "Bestower",
  "Hoarder",
  "Mammoth",
  "Nereus",
  "Sigil",
  "Tayra",
  "Wreathe",
  "Iteron Mark V",
  "Epithal",
  "Kryos",
  "Miasmos",
  // Deep Space Transports (industrial cyno capable)
  "Bustard",
  "Impel",
  "Mastodon",
  "Occator",
  // Covert Ops
  "Anathema",
  "Buzzard",
  "Cheetah",
  "Helios",
  // Stealth bombers
  "Hound",
  "Manticore",
  "Nemesis",
  "Purifier",
  // Expedition / strategic hulls that can field covert cynos with correct fit/subsystem
  "Venture",
  "Prospect",
  "Loki",
  "Legion",
  "Proteus",
  "Tengu",
  // Heavy interdictors (standard cyno capable)
  "Onyx",
  "Devoter",
  "Broadsword",
  "Phobos"
]);

const JUMP_CAPABLE_KEYWORDS = [
  "Dreadnought",
  "Carrier",
  "Supercarrier",
  "Titan",
  "Force Auxiliary",
  "Black Ops",
  "Jump Freighter"
];

const JUMP_CAPABLE_SHIPS = new Set<string>([
  "Revelation",
  "Phoenix",
  "Moros",
  "Naglfar",
  "Archon",
  "Thanatos",
  "Nidhoggur",
  "Chimera",
  "Wyvern",
  "Aeon",
  "Hel",
  "Nyx",
  "Avatar",
  "Leviathan",
  "Ragnarok",
  "Erebus",
  "Nomad",
  "Ark",
  "Anshar",
  "Rhea",
  "Widow",
  "Sin",
  "Redeemer",
  "Panther",
  "Marshal"
]);

const POD_SHIP_TYPE_IDS = new Set<number>([670, 33328]);

const CYNO_CAPABLE_NON_COMBAT_BAIT_SHIPS = new Set<string>([
  // Tech I haulers / industrials
  "Badger",
  "Bestower",
  "Hoarder",
  "Mammoth",
  "Nereus",
  "Sigil",
  "Tayra",
  "Wreathe",
  "Iteron Mark V",
  "Epithal",
  "Kryos",
  "Miasmos",
  // Blockade runners
  "Prowler",
  "Prorator",
  "Crane",
  "Viator",
  // Deep space transports
  "Bustard",
  "Impel",
  "Mastodon",
  "Occator",
  // Expedition / industrial cyno hulls
  "Venture",
  "Prospect",
  "Deluge"
]);

export function evaluateCynoRisk(params: {
  predictedShips: ShipPrediction[];
  characterId: number;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  namesByTypeId: Map<number, string>;
}): CynoRisk {
  const reasons: string[] = [];
  const perShip = estimateShipCynoChance(params);

  const hullCynoCapable = [...perShip.values()].some((row) => row.cynoCapable);
  const potentialCyno = [...perShip.values()].some((row) => row.cynoChance >= 50);
  if (potentialCyno) {
    reasons.push("Likely ship list includes cyno-capable hull with significant cyno fit evidence");
  } else if (hullCynoCapable) {
    reasons.push("Likely ship is cyno-capable, but no recent cyno module in losses");
  }

  const baitScore = estimateBaitScore(params, perShip);
  const jumpAssociation = baitScore >= 70;
  if (jumpAssociation) {
    reasons.push("Likely bait profile: cyno/tackle/tank indicators in recent losses");
  }

  return {
    potentialCyno,
    jumpAssociation,
    reasons
  };
}

export function estimateShipCynoChance(params: {
  predictedShips: ShipPrediction[];
  characterId: number;
  losses: ZkillKillmail[];
  namesByTypeId: Map<number, string>;
}): Map<string, ShipCynoChance> {
  const result = new Map<string, ShipCynoChance>();
  const lossesByShipName = new Map<string, LossCynoStats>();
  const lossesByShipTypeId = new Map<number, LossCynoStats>();
  let totalLosses = 0;
  let totalCynoLosses = 0;

  for (const loss of params.losses) {
    if (loss.victim.character_id !== params.characterId) {
      continue;
    }
    totalLosses += 1;
    const shipTypeId = loss.victim.ship_type_id;
    const shipName = shipTypeId
      ? params.namesByTypeId.get(shipTypeId) ?? `Type ${shipTypeId}`
      : "Unknown Ship";
    const hasCyno = hasFittedCynoModuleInLoss(loss, params.namesByTypeId);
    if (hasCyno) {
      totalCynoLosses += 1;
    }

    incrementLossCynoStats(lossesByShipName, shipName, hasCyno);
    if (typeof shipTypeId === "number") {
      incrementLossCynoStats(lossesByShipTypeId, shipTypeId, hasCyno);
    }
  }

  const globalRate = totalLosses > 0 ? totalCynoLosses / totalLosses : 0;

  for (const ship of params.predictedShips) {
    // Deterministic evidence priority:
    // 1) Same-ship-type fitted cyno module evidence => 100%, regardless of whitelist.
    // 2) Whitelist capability + other-hull fitted cyno evidence => intermediate confidence.
    // 3) Whitelist capability only => low baseline confidence.
    const sameShipTypeFittedCynoEvidence = hasSameShipTypeFittedCynoEvidence(
      ship,
      lossesByShipTypeId,
      lossesByShipName
    );
    if (sameShipTypeFittedCynoEvidence) {
      result.set(ship.shipName, { cynoCapable: true, cynoChance: 100 });
      continue;
    }

    const capable = COVERT_OR_CYNO_SHIPS.has(ship.shipName);
    if (!capable) {
      result.set(ship.shipName, { cynoCapable: false, cynoChance: 0 });
      continue;
    }

    let chance: number;
    if (totalCynoLosses > 0) {
      chance = Math.round(clamp(25 + ship.probability * 0.25 + globalRate * 35, 20, 85));
    } else {
      chance = Math.round(clamp(8 + ship.probability * 0.15, 5, 30));
    }

    result.set(ship.shipName, { cynoCapable: true, cynoChance: chance });
  }

  return result;
}

function hasSameShipTypeFittedCynoEvidence(
  ship: ShipPrediction,
  lossesByShipTypeId: Map<number, LossCynoStats>,
  lossesByShipName: Map<string, LossCynoStats>
): boolean {
  if (typeof ship.shipTypeId === "number") {
    return (lossesByShipTypeId.get(ship.shipTypeId)?.cyno ?? 0) > 0;
  }
  return (lossesByShipName.get(ship.shipName)?.cyno ?? 0) > 0;
}

function incrementLossCynoStats<TKey extends string | number>(
  lossesByShip: Map<TKey, LossCynoStats>,
  key: TKey,
  hasCyno: boolean
): void {
  const current = lossesByShip.get(key) ?? { total: 0, cyno: 0 };
  current.total += 1;
  if (hasCyno) {
    current.cyno += 1;
  }
  lossesByShip.set(key, current);
}

function collectHistoricalShipNames(params: {
  characterId: number;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  namesByTypeId: Map<number, string>;
}): string[] {
  const names = new Set<string>();
  for (const kill of params.kills) {
    const attacker = kill.attackers?.find((entry) => entry.character_id === params.characterId);
    if (attacker?.ship_type_id) {
      const name = params.namesByTypeId.get(attacker.ship_type_id);
      if (name) {
        names.add(name);
      }
    }
  }

  for (const loss of params.losses) {
    if (loss.victim.character_id === params.characterId && loss.victim.ship_type_id) {
      const name = params.namesByTypeId.get(loss.victim.ship_type_id);
      if (name) {
        names.add(name);
      }
    }
  }

  return [...names];
}

function estimateBaitScore(
  params: {
    predictedShips: ShipPrediction[];
    characterId: number;
    kills: ZkillKillmail[];
    losses: ZkillKillmail[];
    namesByTypeId: Map<number, string>;
  },
  perShip: Map<string, ShipCynoChance>
): number {
  let best = 0;
  const historicalNames = collectHistoricalShipNames(params);
  const hasJumpAssociation = historicalNames.some((name) => isJumpCapableShip(name));
  const globalCynoEvidence = params.losses.some((loss) => hasFittedCynoModuleInLoss(loss, params.namesByTypeId));

  for (const ship of params.predictedShips) {
    const scoreRow = perShip.get(ship.shipName);
    const shipLosses = params.losses.filter(
      (loss) =>
        loss.victim.character_id === params.characterId &&
        params.namesByTypeId.get(loss.victim.ship_type_id ?? -1) === ship.shipName
    );
    const moduleNames = shipLosses.flatMap((loss) =>
      (loss.victim.items ?? [])
        .map((item) => params.namesByTypeId.get(item.item_type_id))
        .filter((name): name is string => Boolean(name))
    );

    const hasTackle = moduleNames.some((name) => isTackleModuleName(name));
    const hasTank = moduleNames.some((name) => isTankModuleName(name));
    const hasShipCynoEvidence = shipLosses.some((loss) => hasFittedCynoModuleInLoss(loss, params.namesByTypeId));
    const hasShipCynoCapability = scoreRow?.cynoCapable ?? false;
    const cynoChance = scoreRow?.cynoChance ?? 0;

    let score = 0;
    // Probability-weighted confidence that this ship is actually on grid.
    score += Math.min(25, Math.round(ship.probability * 0.25));

    if (hasShipCynoCapability && cynoChance >= 50) {
      score += 35;
    } else if (hasShipCynoCapability && globalCynoEvidence) {
      score += 15;
    }

    if (hasShipCynoEvidence) {
      score += 20;
    }
    if (hasTackle) {
      score += 20;
    }
    if (hasTank) {
      score += 15;
    }
    if (isBaitHull(ship.shipName)) {
      score += 15;
    }
    // Weak-only signal: jump-capable history should never trigger bait alone.
    if (hasJumpAssociation && (hasTackle || hasShipCynoEvidence)) {
      score += 8;
    }

    best = Math.max(best, score);
  }

  return best;
}

function collectShipCynoBaitCandidates(
  ship: ShipPrediction,
  fitId: string,
  pilotWideBaitKills: ZkillKillmail[],
  params: {
    losses: ZkillKillmail[];
    characterId: number;
    namesByTypeId: Map<number, string>;
  }
): { cyno: PillEvidenceCandidate[]; bait: PillEvidenceCandidate[] } {
  const cyno: PillEvidenceCandidate[] = [];
  const bait: PillEvidenceCandidate[] = [];

  if (!ship.shipTypeId) {
    return { cyno, bait };
  }

  for (const loss of params.losses) {
    if (loss.victim.character_id !== params.characterId) {
      continue;
    }
    if (loss.victim.ship_type_id !== ship.shipTypeId) {
      continue;
    }
    for (const item of loss.victim.items ?? []) {
      if (!isFittedItemFlag(item.flag)) {
        continue;
      }
      const moduleName = params.namesByTypeId.get(item.item_type_id);
      if (!moduleName) {
        continue;
      }
      const candidate = toPillEvidenceCandidate({
        causingModule: moduleName,
        fitId,
        killmailId: loss.killmail_id,
        timestamp: loss.killmail_time
      });
      if (isCynoModuleName(moduleName)) {
        cyno.push({
          ...candidate,
          pillName: "Cyno"
        });
      }
    }
  }

  if (isCynoCapableNonCombatBaitShip(ship.shipName)) {
    for (const kill of pilotWideBaitKills) {
      bait.push({
        ...toPillEvidenceCandidate({
          causingModule: "Matched attacker ship on killmail",
          fitId,
          killmailId: kill.killmail_id,
          timestamp: kill.killmail_time
        }),
        pillName: "Bait"
      });
    }
  }

  return { cyno, bait };
}

function collectPilotWideBaitKills(
  kills: ZkillKillmail[],
  characterId: number,
  namesByTypeId: Map<number, string>
): ZkillKillmail[] {
  return kills.filter((kill) => isPilotWideBaitKillmail(kill, characterId, namesByTypeId));
}

function isPilotWideBaitKillmail(
  kill: ZkillKillmail,
  characterId: number,
  namesByTypeId: Map<number, string>
): boolean {
  if (kill.zkb?.solo === true) {
    return false;
  }
  const attackers = kill.attackers ?? [];
  const characterAttackers = attackers.filter((attacker) => typeof attacker.character_id === "number");
  if (characterAttackers.length < 2) {
    return false;
  }
  const selfAttacker = characterAttackers.find((attacker) => attacker.character_id === characterId);
  if (!selfAttacker || typeof selfAttacker.ship_type_id !== "number") {
    return false;
  }
  const selfShipName = namesByTypeId.get(selfAttacker.ship_type_id);
  if (!selfShipName || !isCynoCapableNonCombatBaitShip(selfShipName)) {
    return false;
  }
  return !isPodKillmailVictim(kill, namesByTypeId);
}

function isCynoCapableNonCombatBaitShip(name: string): boolean {
  return CYNO_CAPABLE_NON_COMBAT_BAIT_SHIPS.has(name);
}

function isPodKillmailVictim(kill: ZkillKillmail, namesByTypeId: Map<number, string>): boolean {
  const victimShipTypeId = kill.victim.ship_type_id;
  if (typeof victimShipTypeId !== "number") {
    return false;
  }
  if (POD_SHIP_TYPE_IDS.has(victimShipTypeId)) {
    return true;
  }
  const victimShipName = namesByTypeId.get(victimShipTypeId)?.trim().toLowerCase();
  if (!victimShipName) {
    return false;
  }
  return victimShipName === "pod" || victimShipName.includes("capsule");
}

function hasFittedCynoModuleInLoss(loss: ZkillKillmail, namesByTypeId: Map<number, string>): boolean {
  for (const item of loss.victim.items ?? []) {
    if (!isFittedItemFlag(item.flag)) {
      continue;
    }
    const moduleName = namesByTypeId.get(item.item_type_id);
    if (!moduleName) {
      continue;
    }
    if (isCynoModuleName(moduleName)) {
      return true;
    }
  }
  return false;
}

function isCynoModuleName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("cynosural field generator") ||
    lower.includes("covert cynosural field generator") ||
    lower.includes("industrial cynosural field generator")
  );
}

function isJumpCapableShip(name: string): boolean {
  if (JUMP_CAPABLE_SHIPS.has(name)) {
    return true;
  }
  return JUMP_CAPABLE_KEYWORDS.some((keyword) => name.includes(keyword));
}

function isTackleModuleName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("warp scrambler") ||
    lower.includes("warp disruptor") ||
    lower.includes("stasis webifier") ||
    lower.includes("focused warp disruption") ||
    lower.includes("infinite point")
  );
}

function isTankModuleName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("damage control") ||
    lower.includes("bulkhead") ||
    lower.includes("armor plate") ||
    lower.includes("shield extender") ||
    lower.includes("harden") ||
    lower.includes("resistance") ||
    lower.includes("armor repairer") ||
    lower.includes("ancillary armor") ||
    lower.includes("ancillary shield")
  );
}

function isBaitHull(name: string): boolean {
  return (
    name === "Devoter" ||
    name === "Onyx" ||
    name === "Broadsword" ||
    name === "Phobos" ||
    name === "Praxis" ||
    name === "Abaddon" ||
    name === "Raven" ||
    name === "Hyperion" ||
    name === "Maelstrom"
  );
}

function resolveFitId(ship: ShipPrediction, fitCandidates: FitCandidate[]): string {
  if (!ship.shipTypeId) {
    return `${ship.shipName}:unknown-fit`;
  }
  const fit = fitCandidates.find((entry) => entry.shipTypeId === ship.shipTypeId);
  if (!fit) {
    return `${ship.shipName}:unknown-fit`;
  }
  return `${fit.shipTypeId}:${fit.fitLabel}`;
}

function toPillEvidenceCandidate(params: {
  causingModule: string;
  fitId: string;
  killmailId: number;
  timestamp: string;
}): Omit<PillEvidenceCandidate, "pillName"> {
  return {
    causingModule: params.causingModule,
    fitId: params.fitId,
    killmailId: params.killmailId,
    url: killmailZkillUrl(params.killmailId),
    timestamp: params.timestamp
  };
}

function isFittedItemFlag(flag?: number): boolean {
  if (flag === undefined) {
    return true;
  }
  return (
    (flag >= 11 && flag <= 34) || // low/mid/high
    (flag >= 92 && flag <= 99) || // rigs
    (flag >= 125 && flag <= 132) // subsystems
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
