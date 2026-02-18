import type { ZkillKillmail } from "./api/zkill";
import type { FitCandidate, ShipPrediction } from "./intel";
import { killmailZkillUrl } from "./links";
import {
  selectMostRecentPillEvidence,
  type PillEvidenceCandidate,
  type RolePillName
} from "./pillEvidence";

export type RolePill = RolePillName;

export type RolePillEvidence = {
  pillName: RolePill;
  causingModule: string;
  fitId: string;
  killmailId: number;
  url: string;
  timestamp: string;
};

const HIC_HULLS = new Set(["Devoter", "Onyx", "Broadsword", "Phobos"]);

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

type ModuleEvidence = {
  moduleName: string;
  moduleNameLower: string;
  source: "fit" | "loss";
  killmailId?: number;
  timestamp?: string;
};

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
    const moduleEvidence = collectShipModuleEvidence(ship, params);
    const selectedByRole = new Map<RolePill, RolePillEvidence>();

    const disruptorMatches = moduleEvidence.allModules.filter((entry) => isDisruptorModule(entry.moduleNameLower));
    const bubbleMatches = moduleEvidence.allModules.filter((entry) => isBubbleModule(entry.moduleNameLower));

    upsertSelectedRoleEvidence(selectedByRole, "Long Point", disruptorMatches, moduleEvidence.fitId);
    upsertSelectedRoleEvidence(
      selectedByRole,
      "Web",
      moduleEvidence.allModules.filter((entry) => entry.moduleNameLower.includes("stasis webifier")),
      moduleEvidence.fitId
    );
    upsertSelectedRoleEvidence(
      selectedByRole,
      "HIC",
      HIC_HULLS.has(ship.shipName)
        ? [...bubbleMatches, ...disruptorMatches.filter((entry) => isFocusedPointModule(entry.moduleNameLower))]
        : [],
      moduleEvidence.fitId
    );
    upsertSelectedRoleEvidence(selectedByRole, "Bubble", bubbleMatches, moduleEvidence.fitId);
    upsertSelectedRoleEvidence(
      selectedByRole,
      "Boosh",
      moduleEvidence.allModules.filter((entry) => entry.moduleNameLower.includes("micro jump field generator")),
      moduleEvidence.fitId
    );
    upsertSelectedRoleEvidence(
      selectedByRole,
      "Neut",
      moduleEvidence.allModules.filter((entry) => entry.moduleNameLower.includes("energy neutralizer")),
      moduleEvidence.fitId
    );
    upsertSelectedRoleEvidence(
      selectedByRole,
      "Cloaky",
      moduleEvidence.fitModules.filter((entry) => entry.moduleNameLower.includes("cloaking device")),
      moduleEvidence.fitId
    );
    upsertSelectedRoleEvidence(
      selectedByRole,
      "Shield Logi",
      moduleEvidence.allModules.filter((entry) => isShieldLogiModule(entry.moduleNameLower)),
      moduleEvidence.fitId
    );
    upsertSelectedRoleEvidence(
      selectedByRole,
      "Armor Logi",
      moduleEvidence.allModules.filter((entry) => isArmorLogiModule(entry.moduleNameLower)),
      moduleEvidence.fitId
    );

    const normalized = normalizeRolePills(PILL_ORDER.filter((pill) => selectedByRole.has(pill)));
    out.set(ship.shipName, normalized);
    params.onEvidence?.(ship.shipName, normalized.flatMap((pill) => {
      const evidence = selectedByRole.get(pill);
      return evidence ? [evidence] : [];
    }));
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
  allModules: ModuleEvidence[];
  fitModules: ModuleEvidence[];
  fitId?: string;
} {
  const allModules: ModuleEvidence[] = [];
  const fitModules: ModuleEvidence[] = [];
  const fit = resolveShipFitCandidate(ship, params.fitCandidates);
  if (!ship.shipTypeId || !fit) {
    return { allModules, fitModules };
  }

  const lossesByKillmailId = new Map<number, ZkillKillmail>();
  for (const loss of params.losses) {
    if (loss.victim.character_id !== params.characterId) {
      continue;
    }
    if (loss.victim.ship_type_id !== ship.shipTypeId) {
      continue;
    }

    lossesByKillmailId.set(loss.killmail_id, loss);
    for (const item of loss.victim.items ?? []) {
      if (!isFittedItemFlag(item.flag)) {
        continue;
      }
      const itemName = params.namesByTypeId.get(item.item_type_id);
      if (!itemName) {
        continue;
      }
      allModules.push({
        moduleName: itemName,
        moduleNameLower: itemName.toLowerCase(),
        source: "loss",
        killmailId: loss.killmail_id,
        timestamp: loss.killmail_time
      });
    }
  }

  const fitSourceKillmailId = fit.sourceLossKillmailId;
  const fitSourceTimestamp = fitSourceKillmailId ? lossesByKillmailId.get(fitSourceKillmailId)?.killmail_time : undefined;
  if (fit.eftSections) {
    const fitList = [
      ...fit.eftSections.high,
      ...fit.eftSections.mid,
      ...fit.eftSections.low,
      ...fit.eftSections.rig,
      ...fit.eftSections.other
    ];
    for (const moduleName of fitList) {
      const entry: ModuleEvidence = {
        moduleName,
        moduleNameLower: moduleName.toLowerCase(),
        source: "fit",
        killmailId: fitSourceKillmailId,
        timestamp: fitSourceTimestamp
      };
      fitModules.push(entry);
      allModules.push(entry);
    }
  }

  return { allModules, fitModules, fitId: formatFitId(fit) };
}

function resolveShipFitCandidate(ship: ShipPrediction, fitCandidates: FitCandidate[]): FitCandidate | undefined {
  if (!ship.shipTypeId) {
    return undefined;
  }
  return fitCandidates.find((entry) => entry.shipTypeId === ship.shipTypeId);
}

function upsertSelectedRoleEvidence(
  selectedByRole: Map<RolePill, RolePillEvidence>,
  role: RolePill,
  modules: ModuleEvidence[],
  fitId: string | undefined
): void {
  const selected = selectMostRecentPillEvidence(modules.map((entry) => toPillEvidenceCandidate(role, entry, fitId)));
  if (!selected) {
    return;
  }
  selectedByRole.set(role, {
    pillName: role,
    causingModule: selected.causingModule,
    fitId: selected.fitId,
    killmailId: selected.killmailId,
    url: selected.url,
    timestamp: selected.timestamp
  });
}

function toPillEvidenceCandidate(
  role: RolePill,
  entry: ModuleEvidence,
  fitId: string | undefined
): PillEvidenceCandidate {
  return {
    pillName: role,
    causingModule: entry.moduleName,
    fitId: fitId ?? "",
    killmailId: entry.killmailId,
    url: entry.killmailId ? killmailZkillUrl(entry.killmailId) : undefined,
    timestamp: entry.timestamp
  };
}

function formatFitId(fit: FitCandidate): string {
  return `${fit.shipTypeId}:${fit.fitLabel}`;
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

function isFocusedPointModule(name: string): boolean {
  return name.includes("focused warp disruption") || name.includes("infinite point");
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
