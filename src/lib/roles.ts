import type { ZkillKillmail } from "./api/zkill";
import type { FitCandidate, ShipPrediction } from "./intel";

export type RolePill =
  | "Long Point"
  | "Web"
  | "HIC"
  | "Bubble"
  | "Boosh"
  | "Neut"
  | "Cloaky"
  | "Shield Logi"
  | "Armor Logi";

export type RolePillEvidence = {
  role: RolePill;
  source: "hull" | "fit-module" | "loss-module";
  details: string;
  killmailId?: number;
};

const HIC_HULLS = new Set(["Devoter", "Onyx", "Broadsword", "Phobos"]);
const DICTOR_HULLS = new Set(["Sabre", "Flycatcher", "Heretic", "Eris"]);
const BOOSH_HULLS = new Set(["Stork", "Bifrost", "Pontifex", "Magus"]);
// Derived from dogma effect names matching tackle range bonuses (scramb/disrupt + range).
const LONG_POINT_BONUS_HULLS = new Set([
  "Adrestia",
  "Arazu",
  "Ares",
  "Barghest",
  "Broadsword",
  "Crow",
  "Cybele",
  "Devoter",
  "Enforcer",
  "Fiend",
  "Garmur",
  "Imp",
  "Keres",
  "Lachesis",
  "Laelaps",
  "Malediction",
  "Marshal",
  "Maulus Navy Issue",
  "Moros Navy Issue",
  "Onyx",
  "Orthrus",
  "Phobos",
  "Python",
  "Raiju",
  "Shapash",
  "Stiletto",
  "Utu",
  "Whiptail"
]);
const SHIELD_LOGI_HULLS = new Set([
  "Basilisk",
  "Scimitar",
  "Scalpel",
  "Kirin",
  "Minokawa"
]);
const ARMOR_LOGI_HULLS = new Set([
  "Guardian",
  "Oneiros",
  "Deacon",
  "Thalia",
  "Nestor",
  "Lif",
  "Apostle",
  "Ninazu"
]);

const PILL_ORDER: RolePill[] = [
  "Long Point",
  "Web",
  "HIC",
  "Bubble",
  "Boosh",
  "Neut",
  "Cloaky",
  "Shield Logi",
  "Armor Logi"
];

export function deriveShipRolePills(params: {
  predictedShips: ShipPrediction[];
  fitCandidates: FitCandidate[];
  losses: ZkillKillmail[];
  characterId: number;
  namesByTypeId: Map<number, string>;
  onEvidence?: (shipName: string, evidence: RolePillEvidence[]) => void;
}): Map<string, RolePill[]> {
  const out = new Map<string, RolePill[]>();

  for (const ship of params.predictedShips) {
    const pills = new Set<RolePill>();
    const evidence: RolePillEvidence[] = [];
    const moduleEvidence = collectShipModuleEvidence(ship, params);
    const disruptorEvidence = moduleEvidence.allModules.find((entry) => isDisruptorModule(entry.moduleNameLower));
    const webEvidence = moduleEvidence.allModules.find((entry) => entry.moduleNameLower.includes("stasis webifier"));
    const bubbleEvidence = moduleEvidence.allModules.find((entry) => isBubbleModule(entry.moduleNameLower));
    const booshEvidence = moduleEvidence.allModules.find((entry) =>
      entry.moduleNameLower.includes("micro jump field generator")
    );
    const neutEvidence = moduleEvidence.allModules.find((entry) =>
      entry.moduleNameLower.includes("energy neutralizer")
    );
    const cloakEvidence = moduleEvidence.fitModules.find((entry) => entry.moduleNameLower.includes("cloaking device"));
    const shieldLogiEvidence = moduleEvidence.allModules.find((entry) =>
      isShieldLogiModule(entry.moduleNameLower)
    );
    const armorLogiEvidence = moduleEvidence.allModules.find((entry) =>
      isArmorLogiModule(entry.moduleNameLower)
    );

    if (disruptorEvidence || LONG_POINT_BONUS_HULLS.has(ship.shipName)) {
      pills.add("Long Point");
      evidence.push(
        disruptorEvidence
          ? moduleEvidenceToRoleEvidence("Long Point", disruptorEvidence)
          : { role: "Long Point", source: "hull", details: `Hull bonus: ${ship.shipName}` }
      );
    }
    if (webEvidence) {
      pills.add("Web");
      evidence.push(moduleEvidenceToRoleEvidence("Web", webEvidence));
    }
    if (HIC_HULLS.has(ship.shipName)) {
      pills.add("HIC");
      evidence.push({ role: "HIC", source: "hull", details: `HIC hull: ${ship.shipName}` });
    }
    if (DICTOR_HULLS.has(ship.shipName)) {
      pills.add("Bubble");
      evidence.push({ role: "Bubble", source: "hull", details: `Dictor hull: ${ship.shipName}` });
    }
    if (bubbleEvidence || HIC_HULLS.has(ship.shipName)) {
      pills.add("Bubble");
      evidence.push(
        bubbleEvidence
          ? moduleEvidenceToRoleEvidence("Bubble", bubbleEvidence)
          : { role: "Bubble", source: "hull", details: `HIC hull: ${ship.shipName}` }
      );
    }
    if (booshEvidence || BOOSH_HULLS.has(ship.shipName)) {
      pills.add("Boosh");
      evidence.push(
        booshEvidence
          ? moduleEvidenceToRoleEvidence("Boosh", booshEvidence)
          : { role: "Boosh", source: "hull", details: `Boosh hull: ${ship.shipName}` }
      );
    }
    if (neutEvidence) {
      pills.add("Neut");
      evidence.push(moduleEvidenceToRoleEvidence("Neut", neutEvidence));
    }
    if (cloakEvidence) {
      pills.add("Cloaky");
      evidence.push(moduleEvidenceToRoleEvidence("Cloaky", cloakEvidence));
    }
    if (shieldLogiEvidence || SHIELD_LOGI_HULLS.has(ship.shipName)) {
      pills.add("Shield Logi");
      evidence.push(
        shieldLogiEvidence
          ? moduleEvidenceToRoleEvidence("Shield Logi", shieldLogiEvidence)
          : { role: "Shield Logi", source: "hull", details: `Shield logi hull: ${ship.shipName}` }
      );
    }
    if (armorLogiEvidence || ARMOR_LOGI_HULLS.has(ship.shipName)) {
      pills.add("Armor Logi");
      evidence.push(
        armorLogiEvidence
          ? moduleEvidenceToRoleEvidence("Armor Logi", armorLogiEvidence)
          : { role: "Armor Logi", source: "hull", details: `Armor logi hull: ${ship.shipName}` }
      );
    }

    const normalized = normalizeRolePills(PILL_ORDER.filter((pill) => pills.has(pill)));
    out.set(ship.shipName, normalized);
    params.onEvidence?.(
      ship.shipName,
      evidence.filter((entry, index) => normalized.includes(entry.role) && evidence.findIndex(
        (candidate) =>
          candidate.role === entry.role &&
          candidate.source === entry.source &&
          candidate.details === entry.details &&
          candidate.killmailId === entry.killmailId
      ) === index)
    );
  }

  return out;
}

function collectShipModuleEvidence(
  ship: ShipPrediction,
  params: {
    fitCandidates: FitCandidate[];
    losses: ZkillKillmail[];
    characterId: number;
    namesByTypeId: Map<number, string>;
  }
): {
  allModules: Array<{ moduleName: string; moduleNameLower: string; source: "fit" | "loss"; killmailId?: number }>;
  fitModules: Array<{ moduleName: string; moduleNameLower: string; source: "fit" | "loss"; killmailId?: number }>;
} {
  const allModules: Array<{ moduleName: string; moduleNameLower: string; source: "fit" | "loss"; killmailId?: number }> = [];
  const fitModules: Array<{ moduleName: string; moduleNameLower: string; source: "fit" | "loss"; killmailId?: number }> = [];
  const fit = resolveShipFitCandidate(ship, params.fitCandidates);
  if (!ship.shipTypeId || !fit) {
    return { allModules, fitModules };
  }
  if (fit?.eftSections) {
    const fitList = [
      ...fit.eftSections.high,
      ...fit.eftSections.mid,
      ...fit.eftSections.low,
      ...fit.eftSections.rig,
      ...fit.eftSections.other
    ];
    for (const moduleName of fitList) {
      const entry = { moduleName, moduleNameLower: moduleName.toLowerCase(), source: "fit" as const };
      fitModules.push(entry);
      allModules.push(entry);
    }
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
      const itemName = params.namesByTypeId.get(item.item_type_id);
      if (itemName) {
        allModules.push({
          moduleName: itemName,
          moduleNameLower: itemName.toLowerCase(),
          source: "loss",
          killmailId: loss.killmail_id
        });
      }
    }
  }

  return { allModules, fitModules };
}

function resolveShipFitCandidate(ship: ShipPrediction, fitCandidates: FitCandidate[]): FitCandidate | undefined {
  if (!ship.shipTypeId) {
    return undefined;
  }
  return fitCandidates.find((entry) => entry.shipTypeId === ship.shipTypeId);
}

function moduleEvidenceToRoleEvidence(
  role: RolePill,
  entry: { moduleName: string; source: "fit" | "loss"; killmailId?: number }
): RolePillEvidence {
  if (entry.source === "loss") {
    return {
      role,
      source: "loss-module",
      details: entry.moduleName,
      killmailId: entry.killmailId
    };
  }
  return {
    role,
    source: "fit-module",
    details: entry.moduleName
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

function isDisruptorModule(name: string): boolean {
  return (
    name.includes("warp disruptor") ||
    name.includes("focused warp disruption") ||
    name.includes("infinite point")
  );
}

function isBubbleModule(name: string): boolean {
  return (
    name.includes("warp disruption field generator") ||
    name.includes("interdiction sphere launcher") ||
    name.includes("warp disruption probe launcher")
  );
}

function isShieldLogiModule(name: string): boolean {
  return (
    name.includes("remote shield booster") ||
    name.includes("shield transport") ||
    name.includes("shield maintenance bot")
  );
}

function isArmorLogiModule(name: string): boolean {
  return (
    name.includes("remote armor repair") ||
    name.includes("armor maintenance bot") ||
    name.includes("remote hull repair")
  );
}

function normalizeRolePills(pills: RolePill[]): RolePill[] {
  const set = new Set(pills);

  // HIC already communicates bubble capability; avoid duplicate signal.
  if (set.has("HIC")) {
    set.delete("Bubble");
  }

  return PILL_ORDER.filter((pill) => set.has(pill));
}
