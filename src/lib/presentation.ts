import type { CynoRisk } from "./cyno";
import type { ShipPrediction } from "./intel";

type ShipRiskFlags = {
  hardCyno: boolean;
  softCyno: boolean;
  bait: boolean;
};

export type EngagementStyle = "Fleet" | "Solo";

export function toPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function toPctNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

export function formatRange(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  const km = value / 1000;
  return `${km.toFixed(km >= 10 ? 0 : 1)}km`;
}

export function formatEhp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return `${Math.round(value)}`;
}

function formatSpeed(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  return `${Math.round(value)}m/s`;
}

export function formatSpeedRange(speed: { base: number; propOn: number; propOnHeated: number }): string {
  const base = formatSpeed(speed.base);
  const heated = formatSpeed(speed.propOnHeated);
  const hasProp = Math.abs(speed.propOnHeated - speed.base) > 1;
  if (!hasProp) {
    return base;
  }
  return `${base} - ${heated}`;
}

export function formatIsk(value?: number): string {
  if (value === undefined) {
    return "-";
  }

  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}b`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}m`;
  }
  return `${Math.round(value)}`;
}

export function formatRatio(value?: number): string {
  if (value === undefined) {
    return "-";
  }
  return value.toFixed(2);
}

export function threatScore(danger?: number): string {
  if (danger === undefined) {
    return "-";
  }
  return (danger / 10).toFixed(1);
}

export function threatLabel(danger?: number): string {
  if (danger === undefined) {
    return "N/A";
  }
  if (danger >= 70) {
    return "HIGH";
  }
  if (danger >= 40) {
    return "MED";
  }
  return "LOW";
}

export function threatClass(danger?: number): string {
  if (danger === undefined) {
    return "";
  }
  if (danger >= 70) {
    return "threat-high";
  }
  if (danger >= 40) {
    return "threat-medium";
  }
  return "threat-low";
}

function isLikelyBaitHullName(name: string): boolean {
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

export function getShipRiskFlags(ship: ShipPrediction, cynoRisk?: CynoRisk): ShipRiskFlags {
  const normalized = ship.shipName.toLowerCase();
  const isPod = normalized.includes("capsule") || normalized.includes("pod");
  const hardCyno = Boolean(ship.cynoCapable) && (ship.cynoChance ?? 0) >= 100;
  const softCyno = false;
  const bait =
    !isPod &&
    ship.probability >= 20 &&
    Boolean(cynoRisk?.jumpAssociation) &&
    (Boolean(ship.cynoCapable) || isLikelyBaitHullName(ship.shipName));

  return { hardCyno, softCyno, bait };
}

export function shipHasPotentialCyno(ship: ShipPrediction): boolean {
  return Boolean(ship.cynoCapable) && (ship.cynoChance ?? 0) >= 100;
}

export function engagementStyleFromSoloRatio(soloRatio?: number): EngagementStyle | null {
  if (!Number.isFinite(soloRatio)) {
    return null;
  }
  if (Number(soloRatio) <= 5) {
    return "Fleet";
  }
  if (Number(soloRatio) >= 15) {
    return "Solo";
  }
  return null;
}

export function engagementStyleTitle(style: EngagementStyle, soloRatio?: number): string {
  const ratio = Number.isFinite(soloRatio) ? `${Number(soloRatio).toFixed(1)}%` : "unknown";
  if (style === "Fleet") {
    return `Fleet: this pilot has a low solo ratio (${ratio}), so they usually fight in a group.`;
  }
  return `Solo: this pilot has a high solo ratio (${ratio}), so they frequently take solo fights.`;
}

export function roleBadgeClass(role: string): string {
  switch (role) {
    case "HIC":
    case "Bubble":
    case "Boosh":
      return "risk-role-hard";
    case "Long Point":
    case "Web":
      return "risk-role-control";
    case "Neut":
      return "risk-role-pressure";
    case "Cloaky":
      return "risk-role-stealth";
    case "Shield Logi":
    case "Armor Logi":
      return "risk-role-support";
    default:
      return "risk-role";
  }
}

export function roleIconClass(role: string): string {
  switch (role) {
    case "HIC":
    case "Bubble":
    case "Boosh":
      return "alert-role-hard";
    case "Long Point":
    case "Web":
      return "alert-role-control";
    case "Neut":
      return "alert-role-pressure";
    case "Cloaky":
      return "alert-role-stealth";
    case "Shield Logi":
    case "Armor Logi":
      return "alert-role-support";
    default:
      return "alert-role";
  }
}

export function roleShort(role: string): string {
  switch (role) {
    case "Long Point":
      return "LP";
    case "Web":
      return "WB";
    case "HIC":
      return "HC";
    case "Bubble":
      return "BB";
    case "Boosh":
      return "BS";
    case "Neut":
      return "NT";
    case "Cloaky":
      return "CL";
    case "Shield Logi":
      return "SL";
    case "Armor Logi":
      return "AL";
    default:
      return role.slice(0, 2).toUpperCase();
  }
}

export function orderRolePills(pills: string[]): string[] {
  const order = [
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
  return pills.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
