import { getType, type DogmaIndex } from "./index";
import type { CombatMetrics, DamageProfile, FitResolvedModule, FitResolvedSlots, LayerResists } from "./types";

export type CalculateCombatMetricsInput = {
  shipTypeId: number;
  slots: FitResolvedSlots;
  drones?: FitResolvedModule[];
  scripts?: FitResolvedModule[];
  implants?: FitResolvedModule[];
  boosters?: FitResolvedModule[];
  heat?: boolean;
};

const DEFAULT_DAMAGE: DamageProfile = { em: 0, therm: 0, kin: 0, exp: 0 };
const NAVIGATION_SPEED_BONUS = 0.25;
const ACCELERATION_CONTROL_BONUS = 0.25;
const GUNNERY_ROF_MULTIPLIER = 0.9;
const SURGICAL_STRIKE_DAMAGE_MULTIPLIER = 1.15;
const WEAPON_SPEC_DAMAGE_MULTIPLIER = 1.1;
const SHARPSHOOTER_RANGE_MULTIPLIER = 1.25;
const TRAJECTORY_ANALYSIS_FALLOFF_MULTIPLIER = 1.25;
const DRONE_INTERFACING_DAMAGE_MULTIPLIER = 2;
const MEDIUM_DRONE_OPERATION_DAMAGE_MULTIPLIER = 1.25;

export function calculateShipCombatMetrics(index: DogmaIndex, input: CalculateCombatMetricsInput): CombatMetrics {
  const assumptions: string[] = [];
  const ship = getType(index, input.shipTypeId);
  const hasShipDogma = Boolean(ship);
  if (!ship) {
    assumptions.push("Ship dogma data unavailable; using conservative hull defaults.");
  }

  const high = input.slots.high ?? [];
  const mid = input.slots.mid ?? [];
  const low = input.slots.low ?? [];
  const rig = input.slots.rig ?? [];

  const weaponModules = high.filter((mod) => isWeaponModule(mod.name));
  const droneModules = (input.drones ?? []).filter((mod) => isDroneModule(index, mod));
  const damageAndRofMods = collectDamageAndRofMods(index, [...low, ...rig], assumptions);
  const droneDamageMultiplier = collectDroneDamageMultiplier(index, [...low, ...rig], assumptions);
  const stacked = applyStackingPenalties(damageAndRofMods);

  let dps = 0;
  let alpha = 0;
  let rangeOptimal = 0;
  let rangeFalloff = 0;
  let missileRange = 0;
  const damage = { ...DEFAULT_DAMAGE };
  let weaponResolved = 0;

  for (const mod of weaponModules) {
    const estimate = estimateWeapon(index, ship, mod);
    const adjustedDps = estimate.dps * stacked.damageMultiplier / Math.max(0.2, stacked.rofMultiplier);
    const adjustedAlpha = estimate.alpha * stacked.damageMultiplier;
    dps += adjustedDps;
    alpha += adjustedAlpha;
    rangeOptimal = Math.max(rangeOptimal, estimate.optimal);
    rangeFalloff = Math.max(rangeFalloff, estimate.falloff);
    missileRange = Math.max(missileRange, estimate.missileMax);
    accumulateDamage(damage, estimate.damageSplit, adjustedDps);
    assumptions.push(...estimate.assumptions);
    if (estimate.resolved) {
      weaponResolved += 1;
    }
  }

  let remainingDroneBandwidth = getAttrLoose(ship?.attrs ?? {}, "Drone Bandwidth", "droneBandwidth") ?? 0;
  for (const mod of droneModules) {
    const estimate = estimateDrone(index, ship, mod, remainingDroneBandwidth);
    remainingDroneBandwidth = Math.max(0, remainingDroneBandwidth - estimate.bandwidthUsed);
    const adjustedDps = estimate.dps * stacked.damageMultiplier / Math.max(0.2, stacked.rofMultiplier);
    const adjustedAlpha = estimate.alpha * stacked.damageMultiplier;
    const adjustedDroneDps = adjustedDps * droneDamageMultiplier;
    const adjustedDroneAlpha = adjustedAlpha * droneDamageMultiplier;
    dps += adjustedDroneDps;
    alpha += adjustedDroneAlpha;
    rangeOptimal = Math.max(rangeOptimal, estimate.optimal);
    rangeFalloff = Math.max(rangeFalloff, estimate.falloff);
    accumulateDamage(damage, estimate.damageSplit, adjustedDroneDps);
    assumptions.push(...estimate.assumptions);
  }

  if (weaponModules.length === 0 && droneModules.length === 0) {
    assumptions.push("No weapon or drone modules resolved; offensive stats likely underreported.");
  }

  const heatFactor = input.heat ? 1.1 : 1.0;
  if (!input.heat) {
    assumptions.push("Heat disabled by default.");
  }
  dps *= heatFactor;
  alpha *= heatFactor;

  const defense = applyDefenseModifiers(index, ship, [...mid, ...low, ...rig], assumptions);
  const speedAndSig = estimateSpeedAndSignature(index, ship, mid, low, rig, assumptions);
  const resists = readResistsFromResonance(defense.resonance);
  const ehp = estimateEhp(defense.hp.shield, defense.hp.armor, defense.hp.hull, resists);

  const effectiveBand = Math.max(rangeOptimal + rangeFalloff, missileRange);

  const confidence = estimateConfidence({
    offenseSources: weaponModules.length + droneModules.length,
    offenseResolved: Math.max(0, weaponResolved + droneModules.length),
    hasShipDogma,
    assumptions
  });

  const normalizedDamage = normalizeDamageProfile(damage);
  if (normalizedDamage.em + normalizedDamage.therm + normalizedDamage.kin + normalizedDamage.exp === 0) {
    assumptions.push("Damage profile estimated from weapon family defaults.");
  }

  return {
    dpsTotal: round1(dps),
    alpha: round1(alpha),
    damageSplit: normalizedDamage,
    engagementRange: {
      optimal: round0(rangeOptimal),
      falloff: round0(rangeFalloff),
      missileMax: round0(missileRange),
      effectiveBand: round0(effectiveBand)
    },
    speed: speedAndSig.speed,
    signature: speedAndSig.signature,
    ehp: Math.max(1, Math.round(ehp)),
    resists,
    confidence,
    assumptions: unique(assumptions)
  };
}

function estimateWeapon(
  index: DogmaIndex,
  ship: { attrs: Record<string, number>; effects: string[] } | undefined,
  module: FitResolvedModule
) {
  const type = getType(index, module.typeId);
  const assumptions: string[] = [];
  const chargeType = module.chargeTypeId ? getType(index, module.chargeTypeId) : undefined;
  const kind = detectWeaponKind(type, module.name);
  const family = detectWeaponFamily(module.name);
  const shipBonus = getShipWeaponBonuses(ship, family);
  const damageMultiplier = getAttrLoose(type?.attrs ?? {}, "Damage Modifier") ?? 1.8;
  const rofMs =
    getAttrLoose(type?.attrs ?? {}, "Rate of fire", "Activation time / duration", "speed") ?? 4500;
  const cycleSeconds = Math.max(0.25, rofMs / 1000);
  const chargeDamage = readDamageFromType(chargeType?.attrs ?? {});
  const moduleDamage = readDamageFromType(type?.attrs ?? {});
  const rawDamage =
    chargeDamage.total > 0
      ? chargeDamage
      : moduleDamage.total > 0
        ? moduleDamage
        : type
          ? { total: 0, split: { ...DEFAULT_DAMAGE } }
          : inferDamageFromName(module.name);
  if (rawDamage.total <= 0) {
    assumptions.push(`Ignoring non-damaging high-slot module ${module.name}.`);
    return {
      dps: 0,
      alpha: 0,
      optimal: 0,
      falloff: 0,
      missileMax: 0,
      damageSplit: { ...DEFAULT_DAMAGE },
      assumptions,
      resolved: false
    };
  }

  let alpha = rawDamage.total * damageMultiplier;
  if (alpha <= 0) {
    alpha = inferProfileBase(module.name) * damageMultiplier;
    assumptions.push(`Fallback volley baseline used for ${module.name}.`);
  }
  const skillDamage = detectWeaponSkillDamageMultiplier(module.name);
  alpha *= skillDamage * SURGICAL_STRIKE_DAMAGE_MULTIPLIER * WEAPON_SPEC_DAMAGE_MULTIPLIER;
  alpha *= shipBonus.damageMultiplier;
  const cycleWithSkills = cycleSeconds * GUNNERY_ROF_MULTIPLIER * shipBonus.rofMultiplier;
  const dps = alpha / cycleWithSkills;
  let optimal =
    getAttrLoose(type?.attrs ?? {}, "Optimal Range", "Maximum Range", "maxRange", "optimal") ??
    inferRange(module.name).optimal;
  let falloff =
    getAttrLoose(type?.attrs ?? {}, "Accuracy falloff", "falloff") ?? inferRange(module.name).falloff;
  const trackingMultiplier = getAttrLoose(chargeType?.attrs ?? {}, "Tracking Speed Multiplier");
  if (trackingMultiplier !== undefined && trackingMultiplier !== 1) {
    assumptions.push(`Charge tracking multiplier applied (${trackingMultiplier.toFixed(2)}).`);
  }
  const rangeMultiplier = getAttrLoose(chargeType?.attrs ?? {}, "Range bonus", "Optimal Range Multiplier");
  if (rangeMultiplier !== undefined && Number.isFinite(rangeMultiplier) && rangeMultiplier > 0) {
    optimal *= rangeMultiplier;
  }
  const falloffMultiplier = getAttrLoose(chargeType?.attrs ?? {}, "Falloff Modifier");
  if (falloffMultiplier !== undefined && Number.isFinite(falloffMultiplier) && falloffMultiplier > 0) {
    falloff *= falloffMultiplier;
  }
  if (kind === "turret") {
    optimal *= SHARPSHOOTER_RANGE_MULTIPLIER;
    falloff *= TRAJECTORY_ANALYSIS_FALLOFF_MULTIPLIER;
    assumptions.push("Applied baseline turret range skills (Sharpshooter V / Trajectory Analysis V).");
  }
  let missileMax = 0;
  if (kind === "missile") {
    const maxVelocity = getAttrLoose(chargeType?.attrs ?? {}, "Maximum Velocity");
    const maxFlightMs = getAttrLoose(chargeType?.attrs ?? {}, "Maximum Flight Time");
    if (maxVelocity !== undefined && maxFlightMs !== undefined) {
      missileMax = (maxVelocity * maxFlightMs) / 1000;
    } else {
      missileMax = inferRange(module.name).optimal;
      assumptions.push(`Fallback missile range used for ${module.name}.`);
    }
  }
  const resolved = Boolean(type) && rawDamage.total > 0;
  if (!resolved) {
    assumptions.push(`Conservative fallback for ${module.name} due to missing dogma weapon attrs.`);
  }
  if (shipBonus.notes.length > 0) {
    assumptions.push(...shipBonus.notes);
  }

  return {
    dps,
    alpha,
    optimal,
    falloff,
    missileMax,
    damageSplit: rawDamage.split,
    assumptions,
    resolved
  };
}

function estimateDrone(
  index: DogmaIndex,
  ship: { attrs: Record<string, number>; effects: string[] } | undefined,
  module: FitResolvedModule,
  remainingBandwidth: number
) {
  const type = getType(index, module.typeId);
  const assumptions: string[] = [];
  const requestedQuantity = Math.max(1, Math.round(module.quantity ?? 1));
  const bandwidthPerDrone = getAttrLoose(type?.attrs ?? {}, "Bandwidth Needed", "bandwidthNeeded") ?? 0;
  const maxByBandwidth =
    bandwidthPerDrone > 0 && Number.isFinite(remainingBandwidth)
      ? Math.max(0, Math.floor(remainingBandwidth / bandwidthPerDrone))
      : requestedQuantity;
  const quantity = Math.max(0, Math.min(requestedQuantity, maxByBandwidth));
  if (quantity <= 0) {
    assumptions.push(`Drone ${module.name} excluded by bandwidth limit.`);
    return {
      dps: 0,
      alpha: 0,
      optimal: 0,
      falloff: 0,
      damageSplit: { ...DEFAULT_DAMAGE },
      assumptions,
      bandwidthUsed: 0
    };
  }
  const damage = readDamageFromType(type?.attrs ?? {});
  const damageMultiplier = getAttrLoose(type?.attrs ?? {}, "Damage Modifier") ?? 1;
  const rofMs = getAttrLoose(type?.attrs ?? {}, "Rate of fire", "rateOfFire", "speed") ?? 4000;
  const cycleSeconds = Math.max(0.25, rofMs / 1000);
  const perDroneAlpha = Math.max(0, damage.total * damageMultiplier);
  let perDroneDps = perDroneAlpha > 0 ? perDroneAlpha / cycleSeconds : 0;
  if (perDroneDps <= 0) {
    perDroneDps = getAttrLoose(type?.attrs ?? {}, "droneDps") ?? 24;
    assumptions.push(`Fallback drone DPS baseline used for ${module.name}.`);
  }
  let perDroneDamageMultiplier = DRONE_INTERFACING_DAMAGE_MULTIPLIER;
  const shipEffects = (ship?.effects ?? []).map((effect) => effect.toLowerCase());
  const isMediumDrone = bandwidthPerDrone >= 10;
  if (
    isMediumDrone &&
    shipEffects.some((effect) => effect.includes("shipbonusmediumdronedamagemultiplierpiratefaction"))
  ) {
    // Gila/Rattlesnake style role bonus (+500% medium drone damage).
    perDroneDamageMultiplier *= 6;
    assumptions.push("Applied pirate medium drone role bonus assumption (+500% damage).");
  }
  if (isMediumDrone) {
    perDroneDamageMultiplier *= MEDIUM_DRONE_OPERATION_DAMAGE_MULTIPLIER;
    assumptions.push("Applied baseline medium drone skill damage assumption (all-V pilot).");
  }
  const dps = perDroneDps * quantity * perDroneDamageMultiplier;
  const alpha = perDroneAlpha * quantity * perDroneDamageMultiplier;
  const range = inferRange(module.name);
  assumptions.push(`Drone estimate for ${module.name} is conservative and excludes missing ammo/script context.`);
  return {
    dps,
    alpha,
    optimal: range.optimal,
    falloff: range.falloff,
    damageSplit: damage.total > 0 ? damage.split : inferDamageProfile(module.name),
    assumptions,
    bandwidthUsed: bandwidthPerDrone * quantity
  };
}

function collectDroneDamageMultiplier(
  index: DogmaIndex,
  modules: FitResolvedModule[],
  assumptions: string[]
): number {
  const multipliers: number[] = [];
  for (const module of modules) {
    const type = getType(index, module.typeId);
    const bonus = getAttrLoose(type?.attrs ?? {}, "Drone Damage Bonus", "droneDamageBonus");
    if (bonus !== undefined && Number.isFinite(bonus) && bonus > 0) {
      multipliers.push(1 + bonus / 100);
    }
  }
  if (multipliers.length === 0) {
    return 1;
  }
  assumptions.push(`Applied stacking penalties to ${multipliers.length} drone damage modifiers.`);
  return applyPenaltySeries(multipliers);
}

function isDroneModule(index: DogmaIndex, module: FitResolvedModule): boolean {
  const type = getType(index, module.typeId);
  const effects = (type?.effects ?? []).map((effect) => effect.toLowerCase());
  if (effects.some((effect) => effect.includes("targetattack"))) {
    return true;
  }
  const bandwidthNeeded = getAttrLoose(type?.attrs ?? {}, "Bandwidth Needed", "bandwidthNeeded", "droneBandwidthUsed");
  if (bandwidthNeeded !== undefined && bandwidthNeeded > 0) {
    return true;
  }
  return /drone|hobgoblin|warrior|vespa|hammerhead|valkyrie|infiltrator|praetor|gecko/i.test(module.name);
}

function inferRange(name: string): { optimal: number; falloff: number } {
  const lower = name.toLowerCase();
  if (lower.includes("particle accelerator")) return { optimal: 2500, falloff: 6500 };
  if (lower.includes("blaster")) return { optimal: 2500, falloff: 6500 };
  if (lower.includes("autocannon")) return { optimal: 4500, falloff: 16000 };
  if (lower.includes("railgun")) return { optimal: 18000, falloff: 10000 };
  if (lower.includes("beam")) return { optimal: 28000, falloff: 6000 };
  if (lower.includes("pulse")) return { optimal: 9000, falloff: 5000 };
  if (lower.includes("artillery")) return { optimal: 22000, falloff: 26000 };
  if (lower.includes("launcher") || lower.includes("missile")) return { optimal: 30000, falloff: 0 };
  return { optimal: 7000, falloff: 7000 };
}

function inferProfileBase(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes("small")) return 20;
  if (lower.includes("medium")) return 48;
  if (lower.includes("large")) return 110;
  if (lower.includes("x-large") || lower.includes("xl")) return 190;
  return 35;
}

function inferDamageProfile(name: string): DamageProfile {
  const lower = name.toLowerCase();
  if (lower.includes("laser")) return { em: 0.62, therm: 0.38, kin: 0, exp: 0 };
  if (lower.includes("blaster") || lower.includes("rail") || lower.includes("particle accelerator")) {
    return { em: 0, therm: 0.45, kin: 0.55, exp: 0 };
  }
  if (lower.includes("projectile") || lower.includes("autocannon") || lower.includes("artillery")) {
    return { em: 0.05, therm: 0.2, kin: 0.35, exp: 0.4 };
  }
  if (lower.includes("missile") || lower.includes("launcher") || lower.includes("torpedo")) {
    return { em: 0.15, therm: 0.25, kin: 0.3, exp: 0.3 };
  }
  if (lower.includes("drone")) return { em: 0.1, therm: 0.3, kin: 0.3, exp: 0.3 };
  return { em: 0.2, therm: 0.3, kin: 0.3, exp: 0.2 };
}

function inferDamageFromName(name: string): { total: number; split: DamageProfile } {
  const split = inferDamageProfile(name);
  return { total: inferProfileBase(name), split };
}

function readDamageFromType(attrs: Record<string, number>): { total: number; split: DamageProfile } {
  const em = getAttrLoose(attrs, "EM damage", "emDamage") ?? 0;
  const therm = getAttrLoose(attrs, "Thermal damage", "thermalDamage") ?? 0;
  const kin = getAttrLoose(attrs, "Kinetic damage", "kineticDamage") ?? 0;
  const exp = getAttrLoose(attrs, "Explosive damage", "explosiveDamage") ?? 0;
  const total = em + therm + kin + exp;
  if (total <= 0) {
    return { total: 0, split: { ...DEFAULT_DAMAGE } };
  }
  return {
    total,
    split: {
      em: em / total,
      therm: therm / total,
      kin: kin / total,
      exp: exp / total
    }
  };
}

function detectWeaponKind(type: { effects: string[] } | undefined, moduleName: string): "turret" | "missile" | "other" {
  const effects = (type?.effects ?? []).map((effect) => effect.toLowerCase());
  if (effects.some((effect) => effect.includes("usemissiles") || effect.includes("missile"))) {
    return "missile";
  }
  if (effects.some((effect) => effect.includes("projectilefired") || effect.includes("turretfitted"))) {
    return "turret";
  }
  const normalized = moduleName.toLowerCase();
  if (normalized.includes("launcher") || normalized.includes("missile") || normalized.includes("torpedo")) {
    return "missile";
  }
  if (/(blaster|railgun|particle accelerator|autocannon|artillery|beam|pulse|laser|disintegrator)/i.test(normalized)) {
    return "turret";
  }
  return "other";
}

function isWeaponModule(name: string): boolean {
  return /blaster|railgun|particle accelerator|autocannon|artillery|launcher|missile|laser|beam|pulse|disintegrator/i.test(name);
}

function collectDamageAndRofMods(
  index: DogmaIndex,
  modules: FitResolvedModule[],
  assumptions: string[]
): Array<{ type: "damage" | "rof"; value: number; source: string }> {
  const mods: Array<{ type: "damage" | "rof"; value: number; source: string }> = [];
  for (const module of modules) {
    const type = getType(index, module.typeId);
    const attrs = type?.attrs ?? {};
    const damage = getAttrLoose(attrs, "Damage Modifier");
    if (damage !== undefined && damage > 1.0001 && damage < 2.5) {
      mods.push({ type: "damage", value: damage, source: module.name });
    }
    const rof = getAttrLoose(attrs, "Rate of Fire Bonus");
    if (rof !== undefined && rof > 0 && rof < 1) {
      mods.push({ type: "rof", value: rof, source: module.name });
    }
  }
  if (mods.length > 0) {
    assumptions.push(`Applied stacking penalties to ${mods.length} damage/rof modifiers.`);
  }
  return mods;
}

function applyStackingPenalties(
  modifiers: Array<{ type: "damage" | "rof"; value: number; source: string }>
): { damageMultiplier: number; rofMultiplier: number } {
  const damage = modifiers
    .filter((modifier) => modifier.type === "damage")
    .map((modifier) => modifier.value)
    .sort((a, b) => Math.abs(b - 1) - Math.abs(a - 1));
  const rof = modifiers
    .filter((modifier) => modifier.type === "rof")
    .map((modifier) => modifier.value)
    .sort((a, b) => Math.abs(b - 1) - Math.abs(a - 1));
  return {
    damageMultiplier: applyPenaltySeries(damage),
    rofMultiplier: applyPenaltySeries(rof)
  };
}

function applyPenaltySeries(values: number[]): number {
  let output = 1;
  const boosts = values.filter((value) => value > 1).sort((a, b) => Math.abs(b - 1) - Math.abs(a - 1));
  const penalties = values.filter((value) => value < 1).sort((a, b) => Math.abs(b - 1) - Math.abs(a - 1));
  for (const seq of [boosts, penalties]) {
    for (let i = 0; i < seq.length; i += 1) {
      const value = seq[i];
      output *= 1 + (value - 1) * Math.exp(-(i ** 2) / 7.1289);
    }
  }
  return output;
}

function detectWeaponFamily(name: string): "hybrid" | "projectile" | "energy" | "missile" | "other" {
  const lower = name.toLowerCase();
  if (/(blaster|railgun|particle accelerator|hybrid)/.test(lower)) return "hybrid";
  if (/(autocannon|artillery|projectile)/.test(lower)) return "projectile";
  if (/(pulse|beam|laser)/.test(lower)) return "energy";
  if (/(launcher|missile|torpedo|rocket)/.test(lower)) return "missile";
  return "other";
}

function detectWeaponSkillDamageMultiplier(name: string): number {
  const lower = name.toLowerCase();
  if (/(light|small)/.test(lower)) return 1.25;
  if (/\bmedium\b/.test(lower)) return 1.25;
  if (/\blarge\b/.test(lower)) return 1.25;
  return 1.1;
}

function getShipWeaponBonuses(
  ship: { attrs: Record<string, number>; effects: string[] } | undefined,
  family: "hybrid" | "projectile" | "energy" | "missile" | "other"
): { damageMultiplier: number; rofMultiplier: number; notes: string[] } {
  const effects = (ship?.effects ?? []).map((effect) => effect.toLowerCase());
  const notes: string[] = [];
  let damageMultiplier = 1;
  let rofMultiplier = 1;

  if (family === "hybrid") {
    if (effects.some((effect) => effect.includes("hybridrof"))) {
      rofMultiplier *= 0.5;
      notes.push("Applied hull hybrid ROF bonus assumption (all-V pilot).");
    }
    if (effects.some((effect) => effect.includes("hybriddamage"))) {
      damageMultiplier *= 1.25;
      notes.push("Applied hull hybrid damage bonus assumption (all-V pilot).");
    }
  }

  if (family === "projectile") {
    if (effects.some((effect) => effect.includes("projectilerof"))) {
      rofMultiplier *= 0.75;
      notes.push("Applied hull projectile ROF bonus assumption (all-V pilot).");
    }
    if (effects.some((effect) => effect.includes("projectiledamage"))) {
      damageMultiplier *= 1.25;
      notes.push("Applied hull projectile damage bonus assumption (all-V pilot).");
    }
  }

  if (family === "energy") {
    if (effects.some((effect) => effect.includes("energyrof"))) {
      rofMultiplier *= 0.75;
      notes.push("Applied hull laser ROF bonus assumption (all-V pilot).");
    }
    if (effects.some((effect) => effect.includes("energydamage"))) {
      damageMultiplier *= 1.25;
      notes.push("Applied hull laser damage bonus assumption (all-V pilot).");
    }
  }

  if (family === "missile") {
    if (effects.some((effect) => effect.includes("missilerof"))) {
      rofMultiplier *= 0.75;
      notes.push("Applied hull missile ROF bonus assumption (all-V pilot).");
    }
    if (effects.some((effect) => effect.includes("missiledamage"))) {
      damageMultiplier *= 1.25;
      notes.push("Applied hull missile damage bonus assumption (all-V pilot).");
    }
  }

  return { damageMultiplier, rofMultiplier, notes };
}

function applyDefenseModifiers(
  index: DogmaIndex,
  ship: { attrs: Record<string, number>; effects: string[] } | undefined,
  modules: FitResolvedModule[],
  assumptions: string[]
): {
  hp: { shield: number; armor: number; hull: number };
  resonance: {
    shield: { em: number; therm: number; kin: number; exp: number };
    armor: { em: number; therm: number; kin: number; exp: number };
    hull: { em: number; therm: number; kin: number; exp: number };
  };
} {
  const shipAttrs = ship?.attrs ?? {};
  const hp = {
    shield: getAttrLoose(shipAttrs, "Shield Capacity", "shieldCapacity") ?? 2000,
    armor: getAttrLoose(shipAttrs, "Armor Hitpoints", "armorHP") ?? 1800,
    hull: getAttrLoose(shipAttrs, "Structure Hitpoints", "structureHP", "hp") ?? 1600
  };
  const resonance = {
    shield: {
      em: getAttrLoose(shipAttrs, "Shield EM Damage Resistance", "shieldEmDamageResonance") ?? 1,
      therm: getAttrLoose(shipAttrs, "Shield Thermal Damage Resistance", "shieldThermalDamageResonance") ?? 0.8,
      kin: getAttrLoose(shipAttrs, "Shield Kinetic Damage Resistance", "shieldKineticDamageResonance") ?? 0.6,
      exp: getAttrLoose(shipAttrs, "Shield Explosive Damage Resistance", "shieldExplosiveDamageResonance") ?? 0.5
    },
    armor: {
      em: getAttrLoose(shipAttrs, "Armor EM Damage Resistance", "armorEmDamageResonance") ?? 0.5,
      therm: getAttrLoose(shipAttrs, "Armor Thermal Damage Resistance", "armorThermalDamageResonance") ?? 0.65,
      kin: getAttrLoose(shipAttrs, "Armor Kinetic Damage Resistance", "armorKineticDamageResonance") ?? 0.75,
      exp: getAttrLoose(shipAttrs, "Armor Explosive Damage Resistance", "armorExplosiveDamageResonance") ?? 0.9
    },
    hull: {
      em: getAttrLoose(shipAttrs, "Structure EM Damage Resistance", "emDamageResonance") ?? 1,
      therm: getAttrLoose(shipAttrs, "Structure Thermal Damage Resistance", "thermalDamageResonance") ?? 1,
      kin: getAttrLoose(shipAttrs, "Structure Kinetic Damage Resistance", "kineticDamageResonance") ?? 1,
      exp: getAttrLoose(shipAttrs, "Structure Explosive Damage Resistance", "explosiveDamageResonance") ?? 1
    }
  };
  const resistBuckets: Record<"shield" | "armor" | "hull", Record<"em" | "therm" | "kin" | "exp", number[]>> = {
    shield: { em: [], therm: [], kin: [], exp: [] },
    armor: { em: [], therm: [], kin: [], exp: [] },
    hull: { em: [], therm: [], kin: [], exp: [] }
  };

  for (const mod of modules) {
    const type = getType(index, mod.typeId);
    if (!type) {
      continue;
    }
    const attrs = type.attrs ?? {};
    const effectTags = type.effects.map((effect) => effect.toLowerCase()).join("|");
    const isActiveResistanceModule =
      effectTags.includes("modifyactiveshieldresonancepostpercent") ||
      effectTags.includes("modifyactivearmorresonancepostpercent");
    const shieldBonus = getAttrLoose(attrs, "Shield Bonus");
    const bypassStacking = effectTags.includes("damagecontrol");
    applyHpBonus(hp, "armor", getAttrLoose(attrs, "Armor Hitpoint Bonus"), effectTags);
    if (shieldBonus !== undefined && isShieldCapacityModifier(effectTags) && !isActiveResistanceModule) {
      applyHpBonus(hp, "shield", shieldBonus, effectTags);
    }
    applyHpBonus(hp, "hull", getAttrLoose(attrs, "Structure Hitpoint Bonus"), effectTags);
    applyHpBonus(hp, "hull", getAttrLoose(attrs, "Hitpoint Bonus"), effectTags);

    const pairs: Array<[keyof typeof resonance, keyof (typeof resonance)["shield"], string]> = [
      ["shield", "em", "Shield EM Damage Resistance"],
      ["shield", "therm", "Shield Thermal Damage Resistance"],
      ["shield", "kin", "Shield Kinetic Damage Resistance"],
      ["shield", "exp", "Shield Explosive Damage Resistance"],
      ["armor", "em", "Armor EM Damage Resistance"],
      ["armor", "therm", "Armor Thermal Damage Resistance"],
      ["armor", "kin", "Armor Kinetic Damage Resistance"],
      ["armor", "exp", "Armor Explosive Damage Resistance"],
      ["hull", "em", "Structure EM Damage Resistance"],
      ["hull", "therm", "Structure Thermal Damage Resistance"],
      ["hull", "kin", "Structure Kinetic Damage Resistance"],
      ["hull", "exp", "Structure Explosive Damage Resistance"]
    ];
    for (const [layer, dtype, attrName] of pairs) {
      const value = getAttrLoose(attrs, attrName);
      if (value !== undefined && value > 0) {
        if (isActiveResistanceModule) {
          continue;
        }
        if (bypassStacking) {
          resonance[layer][dtype] *= value;
        } else {
          resistBuckets[layer][dtype].push(value);
        }
      }
    }

    for (const [attrName, value] of Object.entries(attrs)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        continue;
      }
      const m = attrName.match(/^(?:Armor |Shield |Structure )?(EM|Thermal|Kinetic|Explosive) Damage Resistance Bonus$/i);
      if (!m) {
        continue;
      }
      const dtype = damageKey(m[1]);
      const layer = inferResistanceBonusLayer(attrName, effectTags);
      const compensation = shouldApplyPassiveCompensation(effectTags) ? 1.25 : 1;
      const mult = 1 + (value * compensation) / 100;
      if (mult > 0) {
        if (isActiveResistanceModule) {
          continue;
        }
        if (bypassStacking) {
          resonance[layer][dtype] *= mult;
        } else {
          resistBuckets[layer][dtype].push(mult);
        }
      }
    }
  }

  const shipEffects = (ship?.effects ?? []).map((effect) => effect.toLowerCase());
  if (shipEffects.some((effect) => effect.includes("armorresist"))) {
    resonance.armor.em *= 0.8;
    resonance.armor.therm *= 0.8;
    resonance.armor.kin *= 0.8;
    resonance.armor.exp *= 0.8;
    assumptions.push("Applied hull armor resist bonus assumption (all-V pilot).");
  }
  if (shipEffects.some((effect) => effect.includes("shieldresist"))) {
    resonance.shield.em *= 0.8;
    resonance.shield.therm *= 0.8;
    resonance.shield.kin *= 0.8;
    resonance.shield.exp *= 0.8;
    assumptions.push("Applied hull shield resist bonus assumption (all-V pilot).");
  }
  if (shipEffects.some((effect) => effect.includes("shipbonusarmorhpad2"))) {
    hp.armor *= 1.5;
    assumptions.push("Applied hull armor HP bonus assumption (all-V pilot, AD2 profile).");
  } else if (shipEffects.some((effect) => effect.includes("armorhp"))) {
    hp.armor *= 1.25;
    assumptions.push("Applied hull armor HP bonus assumption (all-V pilot).");
  }
  for (const layer of ["shield", "armor", "hull"] as const) {
    for (const dtype of ["em", "therm", "kin", "exp"] as const) {
      resonance[layer][dtype] *= applyPenaltySeries(resistBuckets[layer][dtype]);
    }
  }

  hp.shield *= 1 + 0.05 * 5;
  hp.armor *= 1 + 0.05 * 5;
  hp.hull *= 1 + 0.05 * 5;
  assumptions.push("Applied baseline defense skills (all-V): +25% shield/armor/hull HP.");
  return { hp, resonance };
}

function isShieldCapacityModifier(effectTags: string): boolean {
  return (
    effectTags.includes("shieldcapacity") ||
    effectTags.includes("shieldhpmultiply") ||
    effectTags.includes("shieldhpbonus")
  );
}

function applyHpBonus(
  hp: { shield: number; armor: number; hull: number },
  layer: "shield" | "armor" | "hull",
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

function inferResistanceBonusLayer(
  attrName: string,
  effectTags: string
): "shield" | "armor" | "hull" {
  const lower = attrName.toLowerCase();
  if (lower.startsWith("shield ")) return "shield";
  if (lower.startsWith("armor ")) return "armor";
  if (lower.startsWith("structure ")) return "hull";
  if (effectTags.includes("armorresonance")) return "armor";
  if (effectTags.includes("shieldresonance")) return "shield";
  if (effectTags.includes("structureresonance") || effectTags.includes("hull")) return "hull";
  return "armor";
}

function shouldApplyPassiveCompensation(effectTags: string): boolean {
  return effectTags.includes("modifyarmorresonancepostpercent") || effectTags.includes("modifyshieldresonancepostpercent");
}

function damageKey(token: string): "em" | "therm" | "kin" | "exp" {
  const lower = token.toLowerCase();
  if (lower.startsWith("therm")) return "therm";
  if (lower.startsWith("kin")) return "kin";
  if (lower.startsWith("exp")) return "exp";
  return "em";
}

function estimateSpeedAndSignature(
  index: DogmaIndex,
  ship: { attrs: Record<string, number>; effects: string[] } | undefined,
  mid: FitResolvedModule[],
  low: FitResolvedModule[],
  rig: FitResolvedModule[],
  assumptions: string[]
): { speed: { base: number; propOn: number; propOnHeated: number }; signature: { base: number; propOn: number } } {
  const shipAttrs = ship?.attrs ?? {};
  const baseHullSpeed = getAttrLoose(shipAttrs, "Maximum Velocity") ?? 0;
  const baseHullSig = getAttrLoose(shipAttrs, "Signature Radius") ?? 0;
  const speedMods = collectVelocityModifiers(index, low, rig);
  const stackedSpeed = applyPenaltySeries(speedMods);
  const baseSpeed = baseHullSpeed * (1 + NAVIGATION_SPEED_BONUS) * stackedSpeed;

  const prop = pickPropModule(index, mid);
  if (!prop) {
    assumptions.push("No active prop module detected; reporting cold speed/signature only.");
    return {
      speed: {
        base: round1(baseSpeed),
        propOn: round1(baseSpeed),
        propOnHeated: round1(baseSpeed)
      },
      signature: {
        base: round1(baseHullSig),
        propOn: round1(baseHullSig)
      }
    };
  }

  const propAttrs = prop.type?.attrs ?? {};
  const propBonus = getAttrLoose(propAttrs, "Maximum Velocity Bonus") ?? 0;
  const overloadSpeedBonus = getAttrLoose(propAttrs, "Overload Speed Bonus") ?? 0;
  const sigBloom = getAttrLoose(propAttrs, "Signature Radius Modifier") ?? 0;
  const hullPropBonusMultiplier = inferHullPropSpeedBonusMultiplier(ship, prop.kind, assumptions);
  const bloomMitigation = inferMwdSigBloomMitigation(ship, prop.kind, assumptions);

  const effectivePropBonus = propBonus * (1 + ACCELERATION_CONTROL_BONUS) * hullPropBonusMultiplier;
  const heatedPropBonus = effectivePropBonus * (1 + overloadSpeedBonus / 100);
  const propOnSpeed = baseSpeed * (1 + effectivePropBonus / 100);
  const heatedSpeed = baseSpeed * (1 + heatedPropBonus / 100);
  const propSig = baseHullSig * (1 + (sigBloom / 100) * bloomMitigation);

  assumptions.push(
    `Speed profile assumes Navigation V (+25%) and Acceleration Control V (+25% prop bonus).`
  );
  if (overloadSpeedBonus > 0) {
    assumptions.push(`Heated speed includes module overload speed bonus.`);
  }

  return {
    speed: {
      base: round1(baseSpeed),
      propOn: round1(propOnSpeed),
      propOnHeated: round1(heatedSpeed)
    },
    signature: {
      base: round1(baseHullSig),
      propOn: round1(propSig)
    }
  };
}

function collectVelocityModifiers(index: DogmaIndex, low: FitResolvedModule[], rig: FitResolvedModule[]): number[] {
  const mods: number[] = [];
  for (const module of [...low, ...rig]) {
    const type = getType(index, module.typeId);
    const attrs = type?.attrs ?? {};
    const effects = (type?.effects ?? []).map((effect) => effect.toLowerCase());
    const velocity = getAttrLoose(attrs, "Velocity Modifier");
    if (velocity !== undefined && velocity !== 0) {
      mods.push(1 + velocity / 100);
    }
    const maxVelocityModifier = getAttrLoose(attrs, "maxVelocityModifier");
    if (maxVelocityModifier !== undefined && maxVelocityModifier > 0) {
      mods.push(maxVelocityModifier);
    }
    const drawback = getAttrLoose(attrs, "Drawback");
    if (drawback !== undefined && drawback !== 0 && effects.some((effect) => effect.includes("drawbackmaxvelocity"))) {
      mods.push(1 + drawback / 100);
    }
  }
  return mods;
}

function pickPropModule(
  index: DogmaIndex,
  mid: FitResolvedModule[]
): { row: FitResolvedModule; type?: { attrs: Record<string, number> }; kind: "mwd" | "ab" } | null {
  for (const row of mid) {
    const name = row.name.toLowerCase();
    if (name.includes("microwarpdrive") || name.includes("afterburner")) {
      const type = getType(index, row.typeId);
      const kind = name.includes("microwarpdrive") ? "mwd" : "ab";
      return { row, type, kind };
    }
  }
  return null;
}

function inferMwdSigBloomMitigation(
  ship: { attrs: Record<string, number>; effects: string[] } | undefined,
  propKind: "mwd" | "ab",
  assumptions: string[]
): number {
  if (propKind !== "mwd") {
    return 1;
  }
  const effects = (ship?.effects ?? []).map((effect) => effect.toLowerCase());
  let mitigation = 1;
  if (effects.some((effect) => effect.includes("mwdsignatureradiusrolebonus"))) {
    mitigation = Math.min(mitigation, 0.5);
    assumptions.push("Applied hull MWD signature role bonus assumption.");
  }
  if (effects.some((effect) => effect.includes("interceptormwdsignatureradiusbonus"))) {
    mitigation = Math.min(mitigation, 0.2);
    assumptions.push("Applied interceptor MWD signature bonus assumption.");
  }
  if (
    effects.some(
      (effect) => effect.includes("interdictorsmwdsigradius") || effect.includes("elitebonusinterdictorsmwdsigradius")
    )
  ) {
    mitigation = Math.min(mitigation, 0.5);
    assumptions.push("Applied interdictor MWD signature bonus assumption.");
  }
  const attrMitigationBonus = getAttrLoose(ship?.attrs ?? {}, "MWD sig penalty and cap need bonus");
  if (attrMitigationBonus !== undefined && attrMitigationBonus < 0) {
    mitigation = Math.min(mitigation, Math.max(0.05, 1 + attrMitigationBonus / 100));
    assumptions.push("Applied ship MWD signature penalty reduction attribute.");
  }
  return mitigation;
}

function inferHullPropSpeedBonusMultiplier(
  ship: { attrs: Record<string, number>; effects: string[] } | undefined,
  propKind: "mwd" | "ab",
  assumptions: string[]
): number {
  const effects = (ship?.effects ?? []).map((effect) => effect.toLowerCase());
  let multiplier = 1;
  if (propKind === "ab" && effects.some((effect) => effect.includes("afterburnerspeedfactor"))) {
    multiplier *= 2;
    assumptions.push("Applied hull afterburner speed-factor bonus assumption (+100% prop bonus).");
  }
  return multiplier;
}

function readResistsFromResonance(resonance: {
  shield: { em: number; therm: number; kin: number; exp: number };
  armor: { em: number; therm: number; kin: number; exp: number };
  hull: { em: number; therm: number; kin: number; exp: number };
}): LayerResists {
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

function toResist(resonance: number | undefined): number {
  if (typeof resonance === "number" && Number.isFinite(resonance)) {
    return clamp01(1 - resonance);
  }
  return 0.2;
}

function estimateEhp(shield: number, armor: number, hull: number, resists: LayerResists): number {
  const avg = (p: { em: number; therm: number; kin: number; exp: number }) =>
    (p.em + p.therm + p.kin + p.exp) / 4;
  const shieldEhp = shield / Math.max(0.05, 1 - avg(resists.shield));
  const armorEhp = armor / Math.max(0.05, 1 - avg(resists.armor));
  const hullEhp = hull / Math.max(0.05, 1 - avg(resists.hull));
  return shieldEhp + armorEhp + hullEhp;
}

function accumulateDamage(target: DamageProfile, profile: DamageProfile, dps: number): void {
  target.em += profile.em * dps;
  target.therm += profile.therm * dps;
  target.kin += profile.kin * dps;
  target.exp += profile.exp * dps;
}

function normalizeDamageProfile(input: DamageProfile): DamageProfile {
  const sum = input.em + input.therm + input.kin + input.exp;
  if (sum <= 0) {
    return { em: 0.25, therm: 0.25, kin: 0.25, exp: 0.25 };
  }
  return {
    em: round2(input.em / sum),
    therm: round2(input.therm / sum),
    kin: round2(input.kin / sum),
    exp: round2(input.exp / sum)
  };
}

function estimateConfidence(params: {
  offenseSources: number;
  offenseResolved: number;
  hasShipDogma: boolean;
  assumptions: string[];
}): number {
  let confidence = 80;
  if (!params.hasShipDogma) {
    confidence -= 40;
  }
  if (params.offenseSources === 0) {
    confidence -= 30;
  } else {
    const coverage = params.offenseResolved / params.offenseSources;
    confidence -= Math.round((1 - coverage) * 20);
  }
  confidence -= Math.min(30, params.assumptions.length * 3);
  return Math.max(15, Math.min(99, confidence));
}

function round0(value: number): number {
  return Math.max(0, Math.round(value));
}

function round1(value: number): number {
  return Math.max(0, Number(value.toFixed(1)));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(0.95, value));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function getAttrLoose(attrs: Record<string, number>, ...names: string[]): number | undefined {
  const normalized = new Map<string, number>();
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    normalized.set(normalizeAttrName(key), value);
  }
  for (const name of names) {
    const value = normalized.get(normalizeAttrName(name));
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function normalizeAttrName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
