import type { LayerResists } from "../types";

export type DefenseLayer = "shield" | "armor" | "hull";

export type DefenseDamageType = "em" | "therm" | "kin" | "exp";

export type DefenseHpPool = {
  shield: number;
  armor: number;
  hull: number;
};

export type DefenseResonanceLayer = {
  em: number | undefined;
  therm: number | undefined;
  kin: number | undefined;
  exp: number | undefined;
};

export type DefenseResonanceProfile = {
  shield: DefenseResonanceLayer;
  armor: DefenseResonanceLayer;
  hull: DefenseResonanceLayer;
};

export function normalizeHullResonance(value: number | undefined): number {
  if (value === undefined) {
    return 0.67;
  }
  // pyfa effectively treats "1" structure resonance as baseline ~33% hull resists.
  if (Math.abs(value - 1) < 1e-6) {
    return 0.67;
  }
  return value;
}

export function isShieldCapacityModifier(effectTags: string): boolean {
  return (
    effectTags.includes("shieldcapacity") ||
    effectTags.includes("shieldhpmultiply") ||
    effectTags.includes("shieldhpbonus")
  );
}

export function isShieldExtenderBonusModifier(effectTags: string): boolean {
  return effectTags.includes("shieldcapacitybonusonline");
}

export function isArmorPlateBonusModifier(effectTags: string): boolean {
  return effectTags.includes("armorhpbonusadd");
}

export function applyShieldCapacityBonus(
  hp: DefenseHpPool,
  shieldBonus: number,
  effectTags: string
): void {
  if (!Number.isFinite(shieldBonus) || shieldBonus === 0) {
    return;
  }
  const isPercent =
    effectTags.includes("percent") ||
    effectTags.includes("multiply") ||
    effectTags.includes("postpercent") ||
    effectTags.includes("prepercent");
  if (isPercent) {
    hp.shield *= toMultiplier(shieldBonus);
    return;
  }
  // Shield extenders provide flat HP and should not be interpreted as percentage multipliers.
  hp.shield += shieldBonus;
}

export function applyHpBonus(
  hp: DefenseHpPool,
  layer: DefenseLayer,
  value: number | undefined,
  effectTags: string
): void {
  if (value === undefined || value === 0) {
    return;
  }
  const isAdd = effectTags.includes("add");
  const isPercent = effectTags.includes("percent") || effectTags.includes("multiply");
  if (isAdd && !isPercent) {
    hp[layer] += value;
    return;
  }
  if (isPercent) {
    hp[layer] *= toMultiplier(value);
    return;
  }
  if (value > 2) {
    hp[layer] *= 1 + value / 100;
  } else if (value > 0) {
    hp[layer] *= value;
  }
}

export function inferResistanceBonusLayer(
  attrName: string,
  effectTags: string
): DefenseLayer {
  const lower = attrName.toLowerCase();
  if (lower.startsWith("shield ")) return "shield";
  if (lower.startsWith("armor ")) return "armor";
  if (lower.startsWith("structure ")) return "hull";
  if (effectTags.includes("armorresonance")) return "armor";
  if (effectTags.includes("shieldresonance")) return "shield";
  if (effectTags.includes("structureresonance") || effectTags.includes("hull")) return "hull";
  return "armor";
}

export function shouldApplyPassiveCompensation(effectTags: string): boolean {
  if (effectTags.includes("rigslot")) {
    return false;
  }
  return effectTags.includes("modifyarmorresonancepostpercent") || effectTags.includes("modifyshieldresonancepostpercent");
}

export function damageKey(token: string): DefenseDamageType {
  const lower = token.toLowerCase();
  if (lower.startsWith("therm")) return "therm";
  if (lower.startsWith("kin")) return "kin";
  if (lower.startsWith("exp")) return "exp";
  return "em";
}

export function readResistsFromResonance(resonance: DefenseResonanceProfile): LayerResists {
  return {
    shield: {
      em: toResist(resonance.shield.em),
      therm: toResist(resonance.shield.therm),
      kin: toResist(resonance.shield.kin),
      exp: toResist(resonance.shield.exp)
    },
    armor: {
      em: toResist(resonance.armor.em),
      therm: toResist(resonance.armor.therm),
      kin: toResist(resonance.armor.kin),
      exp: toResist(resonance.armor.exp)
    },
    hull: {
      em: toResist(resonance.hull.em),
      therm: toResist(resonance.hull.therm),
      kin: toResist(resonance.hull.kin),
      exp: toResist(resonance.hull.exp)
    }
  };
}

export function estimateEhp(shield: number, armor: number, hull: number, resists: LayerResists): number {
  const avg = (profile: { em: number; therm: number; kin: number; exp: number }) =>
    (profile.em + profile.therm + profile.kin + profile.exp) / 4;
  const shieldEhp = shield / Math.max(0.05, 1 - avg(resists.shield));
  const armorEhp = armor / Math.max(0.05, 1 - avg(resists.armor));
  const hullEhp = hull / Math.max(0.05, 1 - avg(resists.hull));
  return shieldEhp + armorEhp + hullEhp;
}

function toMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  if (value > 2) {
    return 1 + value / 100;
  }
  if (value > 0) {
    return value;
  }
  return 1;
}

function toResist(resonance: number | undefined): number {
  if (typeof resonance === "number" && Number.isFinite(resonance)) {
    return clampResist(1 - resonance);
  }
  return 0.2;
}

function clampResist(value: number): number {
  return Math.max(0, Math.min(0.95, value));
}
