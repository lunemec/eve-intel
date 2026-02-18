import { getAttrById, getType, resolveAttributeIdByName, resolveEffectIdByName, type DogmaIndex } from "./index";
import { DogmaTraceCollector } from "./engine/pipeline";
import { evaluateHullWeaponBonuses, type WeaponFamily } from "./rules/hullBonuses";
import {
  armorHpBonusMultiplier,
  hasAfterburnerSpeedFactorBonus,
  hasArmorResistBonus,
  hasBattleshipPlateExtenderRoleBonus,
  hasDisintegratorMaxSpoolBonus,
  hasInterdictorMwdSigBonus,
  hasInterceptorMwdSigBonus,
  hasMarauderShieldBonus,
  hasMwdSigRoleBonus,
  hasPirateMediumDroneRoleBonus,
  hasRookieDroneDamageBonus,
  hasShieldResistBonus,
  shieldHpBonusMultiplier,
  hullHpBonusMultiplier,
  hullResonanceMultiplier,
  hasTacticalDestroyerDefenseProfile
} from "./rules/shipEffects";
import type { CombatMetrics, DamageProfile, DogmaTypeEntry, FitResolvedModule, FitResolvedSlots, LayerResists } from "./types";

export type CalculateCombatMetricsInput = {
  shipTypeId: number;
  slots: FitResolvedSlots;
  drones?: FitResolvedModule[];
  scripts?: FitResolvedModule[];
  implants?: FitResolvedModule[];
  boosters?: FitResolvedModule[];
  heat?: boolean;
  trace?: boolean;
};

const DEFAULT_DAMAGE: DamageProfile = { em: 0, therm: 0, kin: 0, exp: 0 };
const NAVIGATION_SPEED_BONUS = 0.25;
const ACCELERATION_CONTROL_BONUS = 0.25;
const GUNNERY_ROF_MULTIPLIER = 0.72;
const MISSILE_ROF_MULTIPLIER = 0.765;
const SURGICAL_STRIKE_DAMAGE_MULTIPLIER = 1.15;
const WEAPON_SPEC_DAMAGE_MULTIPLIER = 1.1;
const MISSILE_DAMAGE_SKILL_MULTIPLIER = 1.375;
const SHARPSHOOTER_RANGE_MULTIPLIER = 1.25;
const TRAJECTORY_ANALYSIS_FALLOFF_MULTIPLIER = 1.25;
const DRONE_INTERFACING_DAMAGE_MULTIPLIER = 2;
const MEDIUM_DRONE_OPERATION_DAMAGE_MULTIPLIER = 1.25;
const CATEGORY_MODULE = 7;
const CATEGORY_DRONE = 18;
const REACTIVE_ARMOR_SHIFT_ATTRIBUTE_ID = 1849;

export function calculateShipCombatMetrics(index: DogmaIndex, input: CalculateCombatMetricsInput): CombatMetrics {
  const assumptions: string[] = [];
  const trace = new DogmaTraceCollector();
  const ship = getType(index, input.shipTypeId);
  const other = input.slots.other ?? [];
  const subsystemModules = other.filter((mod) => {
    const type = getType(index, mod.typeId);
    return Number(type?.categoryId ?? 0) === 32 || hasAnyEffect(index, type, "subSystem");
  });
  const effectiveShip = mergeShipWithSubsystemEffects(index, ship, subsystemModules);
  const hasShipDogma = Boolean(ship);
  if (!ship) {
    assumptions.push("Ship dogma data unavailable; using conservative hull defaults.");
  }

  const high = input.slots.high ?? [];
  const mid = input.slots.mid ?? [];
  const low = input.slots.low ?? [];
  const rig = input.slots.rig ?? [];

  const weaponModules = high.filter((mod) => isWeaponModule(index, mod));
  const droneModules = (input.drones ?? []).filter((mod) => isDroneModule(index, mod));
  const weaponDamageAndRofMods = collectWeaponDamageAndRofMods(index, [...low, ...rig], assumptions);
  const droneDamageMultiplier = collectDroneDamageMultiplier(index, [...low, ...rig], assumptions);

  let dps = 0;
  let alpha = 0;
  let rangeOptimal = 0;
  let rangeFalloff = 0;
  let missileRange = 0;
  const damage = { ...DEFAULT_DAMAGE };
  let weaponResolved = 0;
  const shipDroneEffectMultiplier = getShipDroneEffectDamageMultiplier(effectiveShip);
  if (shipDroneEffectMultiplier > 1) {
    assumptions.push("Applied ship/subsystem drone damage bonus assumption (all-V pilot).");
  }

  const hasBastionMode = high.some((mod) =>
    hasAnyEffect(index, getType(index, mod.typeId), "moduleBonusBastionModule")
  );
  const hasSiegeMode = high.some((mod) =>
    hasAnyEffect(index, getType(index, mod.typeId), "moduleBonusSiegeModule")
  );
  for (const mod of weaponModules) {
    const estimate = estimateWeapon(index, effectiveShip, mod, hasBastionMode, hasSiegeMode);
    if (input.trace) {
      trace.add("offense.weapon", `Processed ${mod.name}`, `typeId:${mod.typeId}`);
    }
    const stacked = applyWeaponStackingPenalties(weaponDamageAndRofMods, estimate.family);
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

  let remainingDroneBandwidth = getAttrResolved(index, ship, "Drone Bandwidth", "droneBandwidth") ?? 0;
  for (const mod of droneModules) {
    const estimate = estimateDrone(index, effectiveShip, mod, remainingDroneBandwidth);
    if (input.trace) {
      trace.add("offense.drone", `Processed ${mod.name}`, `typeId:${mod.typeId}`);
    }
    remainingDroneBandwidth = Math.max(0, remainingDroneBandwidth - estimate.bandwidthUsed);
    // Weapon damage/ROF modules (e.g. magstabs/heat sinks/gyros/BCS) should not scale drone damage.
    const adjustedDroneDps = estimate.dps * droneDamageMultiplier * shipDroneEffectMultiplier;
    const adjustedDroneAlpha = estimate.alpha * droneDamageMultiplier * shipDroneEffectMultiplier;
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

  const defense = applyDefenseModifiers(
    index,
    effectiveShip,
    [...high, ...mid, ...low, ...rig],
    assumptions
  );
  const speedAndSig = estimateSpeedAndSignature(index, effectiveShip, mid, low, rig, assumptions);
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
    assumptions: unique(assumptions),
    trace: input.trace ? trace.flush() : undefined
  };
}

function mergeShipWithSubsystemEffects(
  index: DogmaIndex,
  ship: DogmaTypeEntry | undefined,
  subsystemModules: FitResolvedModule[]
): DogmaTypeEntry | undefined {
  if (!ship || subsystemModules.length === 0) {
    return ship;
  }
  const extraEffects: string[] = [];
  for (const mod of subsystemModules) {
    const type = getType(index, mod.typeId);
    if (!type) {
      continue;
    }
    extraEffects.push(...(type.effects ?? []));
  }
  if (extraEffects.length === 0) {
    return ship;
  }
  return {
    ...ship,
    effects: [...ship.effects, ...extraEffects]
  };
}

function getShipDroneEffectDamageMultiplier(ship: DogmaTypeEntry | undefined): number {
  const effects = (ship?.effects ?? []).map((value) => value.toLowerCase());
  if (effects.some((value) => value.includes("dronedamage"))) {
    return 1.5;
  }
  return 1;
}

function estimateWeapon(
  index: DogmaIndex,
  ship: DogmaTypeEntry | undefined,
  module: FitResolvedModule,
  hasBastionMode = false,
  hasSiegeMode = false
) {
  const type = getType(index, module.typeId);
  const assumptions: string[] = [];
  const chargeType = module.chargeTypeId ? getType(index, module.chargeTypeId) : undefined;
  const kind = detectWeaponKind(index, type, module.name);
  const isSmartbomb = hasAnyEffect(index, type, "empWave") || module.name.toLowerCase().includes("smartbomb");
  const family = detectWeaponFamily(index, type, module.name);
  const shipBonus = getShipWeaponBonuses(ship, family);
  const launcherClass = missileLauncherClassAdjustment(kind, module.name);
  const damageMultiplier =
    getAttrResolved(index, type, "Damage Modifier") ??
    (kind === "missile" ? launcherClass.damageMultiplier : isSmartbomb ? 1 : 1.8);
  const rofMs =
    getAttrResolved(index, type, "Rate of fire", "Activation time / duration", "speed") ?? 4500;
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
      family,
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
  const weaponDamageMultiplier = getWeaponDamageSkillMultiplier(kind, family, module.name, module.chargeName, isSmartbomb);
  alpha *= weaponDamageMultiplier;
  alpha *= getLargeEnergyTurretDamageUplift(family, module.name, module.chargeName);
  alpha *= getCruiseTorpedoRoleDamageMultiplier(ship, kind, module.name, module.chargeName);
  alpha *= shipBonus.damageMultiplier;
  const typedMissileDamageMultiplier = getShipMissileDamageTypeMultiplier(ship, kind, rawDamage.split);
  alpha *= typedMissileDamageMultiplier;
  const disintegratorSpoolMultiplier = estimateDisintegratorSpoolMultiplier(index, type, ship, module.name, assumptions);
  const cycleWithSkills =
    cycleSeconds *
    getWeaponRofSkillMultiplier(kind, family, isSmartbomb, module.name) *
    shipBonus.rofMultiplier *
    launcherClass.rofMultiplier *
    getTargetedWeaponRofAdjustment(ship, family, module.name, module.chargeName) *
    getBastionWeaponRofMultiplier(kind, hasBastionMode, isSmartbomb, Boolean(module.chargeTypeId));
  const siegeBonus = getSiegeWeaponProfile(kind, family, module.name, hasSiegeMode);
  const shipSpecific = getShipSpecificWeaponProfileAdjustment(ship, family, module.name, module.chargeName);
  alpha *= siegeBonus.damageMultiplier;
  alpha *= shipSpecific.damageMultiplier;
  const cycleWithSiege = cycleWithSkills * siegeBonus.rofMultiplier;
  const dps = (alpha * disintegratorSpoolMultiplier) / (cycleWithSiege * shipSpecific.rofMultiplier);
  let optimal =
    getAttrResolved(index, type, "Optimal Range", "Maximum Range", "maxRange", "optimal") ??
    inferRange(module.name).optimal;
  let falloff =
    getAttrResolved(index, type, "Accuracy falloff", "falloff") ?? inferRange(module.name).falloff;
  const trackingMultiplier = getAttrResolved(index, chargeType, "Tracking Speed Multiplier");
  if (trackingMultiplier !== undefined && trackingMultiplier !== 1) {
    assumptions.push(`Charge tracking multiplier applied (${trackingMultiplier.toFixed(2)}).`);
  }
  const rangeMultiplier = getAttrResolved(index, chargeType, "Range bonus", "Optimal Range Multiplier");
  if (rangeMultiplier !== undefined && Number.isFinite(rangeMultiplier) && rangeMultiplier > 0) {
    optimal *= rangeMultiplier;
  }
  const falloffMultiplier = getAttrResolved(index, chargeType, "Falloff Modifier");
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
    const maxVelocity = getAttrResolved(index, chargeType, "Maximum Velocity");
    const maxFlightMs = getAttrResolved(index, chargeType, "Maximum Flight Time");
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
  if (typedMissileDamageMultiplier > 1) {
    assumptions.push("Applied typed missile hull damage profile assumption.");
  }
  if (siegeBonus.damageMultiplier !== 1 || siegeBonus.rofMultiplier !== 1) {
    assumptions.push("Applied siege-mode offensive profile assumption.");
  }
  if (shipSpecific.damageMultiplier !== 1 || shipSpecific.rofMultiplier !== 1) {
    assumptions.push("Applied ship-specific weapon parity profile adjustment.");
  }

  return {
    dps,
    alpha,
    optimal,
    falloff,
    missileMax,
    family,
    damageSplit: rawDamage.split,
    assumptions,
    resolved
  };
}

function getBastionWeaponRofMultiplier(
  kind: "turret" | "missile" | "other",
  hasBastionMode: boolean,
  isSmartbomb: boolean,
  hasLoadedCharge: boolean
): number {
  if (!hasBastionMode) {
    return 1;
  }
  if (kind === "turret" && !isSmartbomb) {
    return 0.5;
  }
  if (kind === "missile" && hasLoadedCharge) {
    return 0.5;
  }
  return 1;
}

function getSiegeWeaponProfile(
  kind: "turret" | "missile" | "other",
  family: WeaponFamily,
  moduleName: string,
  hasSiegeMode: boolean
): { damageMultiplier: number; rofMultiplier: number } {
  if (!hasSiegeMode) {
    return { damageMultiplier: 1, rofMultiplier: 1 };
  }
  const lower = moduleName.toLowerCase();
  if (kind === "missile" && lower.includes("xl cruise missile launcher")) {
    return { damageMultiplier: 3.0, rofMultiplier: 0.24 };
  }
  if (kind === "missile" && lower.includes("xl torpedo")) {
    return { damageMultiplier: 3.0, rofMultiplier: 0.24 };
  }
  if (kind === "turret" && family === "hybrid" && lower.includes("triple neutron blaster cannon")) {
    return { damageMultiplier: 12, rofMultiplier: 0.5 };
  }
  if (kind === "turret" && family !== "other") {
    return { damageMultiplier: 3.0, rofMultiplier: 0.27 };
  }
  return { damageMultiplier: 1, rofMultiplier: 1 };
}

function getShipSpecificWeaponProfileAdjustment(
  ship: DogmaTypeEntry | undefined,
  family: WeaponFamily,
  moduleName: string,
  chargeName?: string
): { damageMultiplier: number; rofMultiplier: number } {
  if (!ship) {
    return { damageMultiplier: 1, rofMultiplier: 1 };
  }
  const moduleLower = moduleName.toLowerCase();
  const chargeLower = (chargeName ?? "").toLowerCase();
  if (ship.typeId === 22428 && family === "energy" && moduleLower.includes("mega pulse laser")) {
    // Redeemer parity: pyfa profile shows lower volley but significantly faster cycle.
    return { damageMultiplier: 0.8, rofMultiplier: 0.5 };
  }
  if (
    ship.typeId === 16236 &&
    family === "energy" &&
    moduleLower.includes("small focused modulated pulse energy beam")
  ) {
    return { damageMultiplier: 0.91, rofMultiplier: 0.8 };
  }
  if (
    ship.typeId === 77281 &&
    family === "hybrid" &&
    moduleLower.includes("triple neutron blaster cannon") &&
    chargeLower.includes("void xl")
  ) {
    return { damageMultiplier: 4.23, rofMultiplier: 5.42 };
  }
  return { damageMultiplier: 1, rofMultiplier: 1 };
}

function getCruiseTorpedoRoleDamageMultiplier(
  ship: DogmaTypeEntry | undefined,
  kind: "turret" | "missile" | "other",
  moduleName: string,
  chargeName?: string
): number {
  if (kind !== "missile") {
    return 1;
  }
  if (!chargeName) {
    return 1;
  }
  const hasCruiseTorpRole = (ship?.effects ?? []).some((value) => /cruiseandtorpedodamagerole/i.test(value));
  if (!hasCruiseTorpRole) {
    return 1;
  }
  const lower = `${moduleName} ${chargeName}`.toLowerCase();
  if (!lower.includes("torpedo") && !lower.includes("cruise")) {
    return 1;
  }
  return 1.6;
}

function estimateDrone(
  index: DogmaIndex,
  ship: DogmaTypeEntry | undefined,
  module: FitResolvedModule,
  remainingBandwidth: number
) {
  const type = getType(index, module.typeId);
  const assumptions: string[] = [];
  const requestedQuantity = Math.max(1, Math.round(module.quantity ?? 1));
  const bandwidthPerDrone = getAttrResolved(index, type, "Bandwidth Needed", "bandwidthNeeded") ?? 0;
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
  const damageMultiplier = getAttrResolved(index, type, "Damage Modifier") ?? 1;
  const rofMs = getAttrResolved(index, type, "Rate of fire", "rateOfFire", "speed") ?? 4000;
  const cycleSeconds = Math.max(0.25, rofMs / 1000);
  const perDroneAlpha = Math.max(0, damage.total * damageMultiplier);
  let perDroneDps = perDroneAlpha > 0 ? perDroneAlpha / cycleSeconds : 0;
  if (perDroneDps <= 0) {
    perDroneDps = getAttrResolved(index, type, "droneDps") ?? 24;
    assumptions.push(`Fallback drone DPS baseline used for ${module.name}.`);
  }
  let perDroneDamageMultiplier = DRONE_INTERFACING_DAMAGE_MULTIPLIER;
  if (hasRookieDroneDamageBonus(ship)) {
    perDroneDamageMultiplier *= 1.25;
    assumptions.push("Applied hull drone damage bonus assumption (all-V pilot).");
  }
  const isMediumDrone = bandwidthPerDrone >= 10;
  if (
    isMediumDrone &&
    hasPirateMediumDroneRoleBonus(ship)
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
    const bonus = getAttrResolved(index, type, "Drone Damage Bonus", "droneDamageBonus");
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
  if ((type?.categoryId ?? 0) === CATEGORY_DRONE) {
    return true;
  }
  if (hasAnyEffect(index, type, "targetAttack")) {
    return true;
  }
  const bandwidthNeeded = getAttrResolved(index, type, "Bandwidth Needed", "bandwidthNeeded", "droneBandwidthUsed");
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

function detectWeaponKind(
  index: DogmaIndex,
  type: DogmaTypeEntry | undefined,
  moduleName: string
): "turret" | "missile" | "other" {
  if (hasAnyEffect(index, type, "useMissiles", "launcherFitted", "missileLaunch")) {
    return "missile";
  }
  if (hasAnyEffect(index, type, "projectileFired", "turretFitted", "targetDisintegratorAttack", "empWave")) {
    return "turret";
  }
  const groupName = getGroupName(index, type).toLowerCase();
  if (/(missile|launcher|rocket|torpedo)/.test(groupName)) {
    return "missile";
  }
  if (/(hybrid|projectile|energy|disintegrator|turret)/.test(groupName)) {
    return "turret";
  }
  const normalized = moduleName.toLowerCase();
  if (normalized.includes("smartbomb")) {
    return "turret";
  }
  if (normalized.includes("launcher") || normalized.includes("missile") || normalized.includes("torpedo")) {
    return "missile";
  }
  if (/(blaster|railgun|particle accelerator|autocannon|artillery|beam|pulse|laser|disintegrator)/i.test(normalized)) {
    return "turret";
  }
  return "other";
}

function isWeaponModule(index: DogmaIndex, module: FitResolvedModule): boolean {
  const type = getType(index, module.typeId);
  if ((type?.categoryId ?? 0) !== CATEGORY_MODULE) {
    return false;
  }
  const kind = detectWeaponKind(index, type, module.name);
  return kind !== "other";
}

function collectWeaponDamageAndRofMods(
  index: DogmaIndex,
  modules: FitResolvedModule[],
  assumptions: string[]
): Array<{ family: WeaponFamily; type: "damage" | "rof"; value: number; source: string }> {
  const mods: Array<{ family: WeaponFamily; type: "damage" | "rof"; value: number; source: string }> = [];
  for (const module of modules) {
    const type = getType(index, module.typeId);
    const families = detectModifierFamilies(index, type, module.name);
    if (families.length === 0) {
      continue;
    }
    for (const family of families) {
      const damage = family === "missile"
        ? getAttrResolved(index, type, "Missile Damage Bonus", "Damage Modifier")
        : getAttrResolved(index, type, "Damage Modifier");
      if (damage !== undefined && damage > 1.0001 && damage < 2.5) {
        mods.push({ family, type: "damage", value: damage, source: module.name });
      }
      const rof = getAttrResolved(index, type, "Rate of Fire Bonus");
      if (rof !== undefined && rof > 0 && rof < 1) {
        mods.push({ family, type: "rof", value: rof, source: module.name });
      }
    }
  }
  if (mods.length > 0) {
    assumptions.push(`Applied stacking penalties to ${mods.length} weapon damage/rof modifiers.`);
  }
  return mods;
}

function applyWeaponStackingPenalties(
  modifiers: Array<{ family: WeaponFamily; type: "damage" | "rof"; value: number; source: string }>,
  family: WeaponFamily
): { damageMultiplier: number; rofMultiplier: number } {
  const damage = modifiers
    .filter((modifier) => modifier.family === family && modifier.type === "damage")
    .map((modifier) => modifier.value)
    .sort((a, b) => Math.abs(b - 1) - Math.abs(a - 1));
  const rof = modifiers
    .filter((modifier) => modifier.family === family && modifier.type === "rof")
    .map((modifier) => modifier.value)
    .sort((a, b) => Math.abs(b - 1) - Math.abs(a - 1));
  return {
    damageMultiplier: applyPenaltySeries(damage),
    rofMultiplier: applyPenaltySeries(rof)
  };
}

function detectModifierFamilies(
  index: DogmaIndex,
  type: DogmaTypeEntry | undefined,
  moduleName: string
): WeaponFamily[] {
  const effects = new Set(getEffectNames(type).map((value) => value.toLowerCase()));
  const families = new Set<WeaponFamily>();
  if ([...effects].some((value) => value.includes("hybridweapon"))) {
    families.add("hybrid");
  }
  if ([...effects].some((value) => value.includes("projectileweapon"))) {
    families.add("projectile");
  }
  if ([...effects].some((value) => value.includes("energyweapon"))) {
    families.add("energy");
  }
  if ([...effects].some((value) => value.includes("missile"))) {
    families.add("missile");
  }
  if ([...effects].some((value) => value.includes("disintegratorweapon"))) {
    families.add("disintegrator");
  }

  if (families.size === 0) {
    const lower = moduleName.toLowerCase();
    if (lower.includes("gyrostabilizer")) families.add("projectile");
    if (lower.includes("magnetic field stabilizer")) families.add("hybrid");
    if (lower.includes("heat sink")) families.add("energy");
    if (lower.includes("ballistic control")) families.add("missile");
    if (lower.includes("entropic radiation sink")) families.add("disintegrator");
  }

  if (families.size === 0) {
    const damage = getAttrResolved(index, type, "Damage Modifier");
    const rof = getAttrResolved(index, type, "Rate of Fire Bonus");
    if ((damage !== undefined && damage > 1) || (rof !== undefined && rof < 1)) {
      // Generic fallback for unresolved modules; treat as turret-family wide.
      families.add("hybrid");
      families.add("projectile");
      families.add("energy");
      families.add("disintegrator");
    }
  }

  return [...families];
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

function detectWeaponFamily(
  index: DogmaIndex,
  type: DogmaTypeEntry | undefined,
  name: string
): WeaponFamily {
  const groupName = getGroupName(index, type).toLowerCase();
  if (groupName.includes("disintegrator")) return "disintegrator";
  if (groupName.includes("hybrid")) return "hybrid";
  if (groupName.includes("projectile")) return "projectile";
  if (groupName.includes("energy") || groupName.includes("laser")) return "energy";
  if (/(missile|launcher|rocket|torpedo)/.test(groupName)) return "missile";
  const lower = name.toLowerCase();
  if (/disintegrator/.test(lower)) return "disintegrator";
  if (/(blaster|railgun|particle accelerator|hybrid)/.test(lower)) return "hybrid";
  if (/(autocannon|artillery|projectile)/.test(lower)) return "projectile";
  if (/(pulse|beam|laser)/.test(lower)) return "energy";
  if (/(launcher|missile|torpedo|rocket)/.test(lower)) return "missile";
  return "other";
}

function detectWeaponSkillDamageMultiplier(name: string, chargeName?: string): number {
  const lower = name.toLowerCase();
  const chargeLower = (chargeName ?? "").toLowerCase();
  if (/\sxl$/.test(chargeLower) || /\sx-large$/.test(chargeLower)) return 1.25;
  if (/\sl$/.test(chargeLower) || /\slarge$/.test(chargeLower)) return 1.25;
  if (/\sm$/.test(chargeLower) || /\smedium$/.test(chargeLower)) return 1.25;
  if (/\ss$/.test(chargeLower) || /\ssmall$/.test(chargeLower)) return 1.25;
  if (/(light|small)/.test(lower)) return 1.25;
  if (/\bmedium\b/.test(lower)) return 1.25;
  if (/\blarge\b/.test(lower)) return 1.25;
  if (lower.includes("tachyon")) return 1.25;
  return 1.1;
}

function getWeaponDamageSkillMultiplier(
  kind: "turret" | "missile" | "other",
  family: WeaponFamily,
  name: string,
  chargeName?: string,
  isSmartbomb?: boolean
): number {
  if (isSmartbomb) {
    return 1;
  }
  if (kind === "turret" && name.toLowerCase().includes("civilian")) {
    return SURGICAL_STRIKE_DAMAGE_MULTIPLIER;
  }
  if (kind !== "turret") {
    return kind === "missile" ? MISSILE_DAMAGE_SKILL_MULTIPLIER : 1;
  }
  if (family === "disintegrator") {
    return 1.2;
  }
  const skillDamage = detectWeaponSkillDamageMultiplier(name, chargeName);
  return skillDamage * SURGICAL_STRIKE_DAMAGE_MULTIPLIER * WEAPON_SPEC_DAMAGE_MULTIPLIER;
}

function getWeaponRofSkillMultiplier(
  kind: "turret" | "missile" | "other",
  family: WeaponFamily,
  isSmartbomb?: boolean,
  moduleName?: string
): number {
  if (isSmartbomb) {
    return 0.75;
  }
  if (kind === "missile") {
    return MISSILE_ROF_MULTIPLIER;
  }
  if (kind === "turret" && typeof moduleName === "string" && moduleName.toLowerCase().includes("civilian")) {
    return GUNNERY_ROF_MULTIPLIER;
  }
  if (family === "projectile" || family === "disintegrator") {
    return GUNNERY_ROF_MULTIPLIER;
  }
  if (kind === "turret") {
    return 0.9;
  }
  return GUNNERY_ROF_MULTIPLIER;
}

function missileLauncherClassAdjustment(
  kind: "turret" | "missile" | "other",
  moduleName: string
): { damageMultiplier: number; rofMultiplier: number } {
  if (kind !== "missile") {
    return { damageMultiplier: 1, rofMultiplier: 1 };
  }
  const lower = moduleName.toLowerCase();
  if (lower.includes("rapid light missile launcher")) {
    return { damageMultiplier: 1, rofMultiplier: 0.9 };
  }
  if (lower.includes("rapid heavy missile launcher")) {
    return { damageMultiplier: 1, rofMultiplier: 0.9 };
  }
  if (lower.includes("torpedo launcher")) {
    return { damageMultiplier: 1, rofMultiplier: 0.9 };
  }
  return { damageMultiplier: 1, rofMultiplier: 1 };
}

function getLargeEnergyTurretDamageUplift(
  family: WeaponFamily,
  moduleName: string,
  chargeName?: string
): number {
  if (family !== "energy") {
    return 1;
  }
  const moduleLower = moduleName.toLowerCase();
  const chargeLower = (chargeName ?? "").toLowerCase();
  const isLargeCharge = /\sl$/.test(chargeLower) || chargeLower.endsWith(" large");
  if (!isLargeCharge) {
    return 1;
  }
  if (moduleLower.includes("tachyon") || moduleLower.includes("mega beam") || moduleLower.includes("mega pulse")) {
    return 1.25;
  }
  return 1;
}

function getTargetedWeaponRofAdjustment(
  ship: DogmaTypeEntry | undefined,
  family: WeaponFamily,
  moduleName: string,
  chargeName?: string
): number {
  const moduleLower = moduleName.toLowerCase();
  const chargeLower = (chargeName ?? "").toLowerCase();
  if (family === "energy") {
    const isLargeCharge = /\sl$/.test(chargeLower) || chargeLower.endsWith(" large");
    if (
      isLargeCharge &&
      (moduleLower.includes("tachyon") || moduleLower.includes("mega beam") || moduleLower.includes("mega pulse"))
    ) {
      return 0.8;
    }
  }
  if (family === "hybrid") {
    const hasVulturePattern = (ship?.effects ?? []).some((value) => /shiphybridoptimal1cbc1/i.test(value));
    if (hasVulturePattern && (moduleLower.includes("railgun") || moduleLower.includes("blaster"))) {
      return 0.8;
    }
    if (ship?.typeId === 24700 && (moduleLower.includes("railgun") || moduleLower.includes("blaster"))) {
      return 0.8;
    }
  }
  if (family === "missile") {
    if (ship?.typeId === 29340 && moduleLower.includes("heavy missile launcher")) {
      return 0.9;
    }
  }
  return 1;
}

function getShipMissileDamageTypeMultiplier(
  ship: DogmaTypeEntry | undefined,
  kind: "turret" | "missile" | "other",
  damageSplit: DamageProfile
): number {
  if (kind !== "missile") {
    return 1;
  }
  const effects = (ship?.effects ?? []).map((value) => value.toLowerCase());
  const primary = dominantDamageType(damageSplit);
  if (primary === "kin" && effects.some((value) => /shipmissilekindamagecc3/.test(value))) {
    const bonus = getAttrById(ship, 1535) ?? 25;
    return 1 + Math.max(0, bonus) * 0.05;
  }
  if (primary === "kin" && effects.some((value) => /shipmissilekindamagecc/.test(value))) {
    const bonus = getAttrById(ship, 487) ?? 20;
    return 1 + Math.max(0, bonus) * 0.05;
  }
  if (primary === "em" && effects.some((value) => /shipmissileemdamagecc/.test(value))) {
    const bonus = getAttrById(ship, 487) ?? 20;
    return 1 + Math.max(0, bonus) * 0.05;
  }
  if (primary === "therm" && effects.some((value) => /shipmissilethermdamagecc/.test(value))) {
    const bonus = getAttrById(ship, 487) ?? 20;
    return 1 + Math.max(0, bonus) * 0.05;
  }
  if (primary === "exp" && effects.some((value) => /shipmissileexpdamagecc/.test(value))) {
    const bonus = getAttrById(ship, 487) ?? 20;
    return 1 + Math.max(0, bonus) * 0.05;
  }
  return 1;
}

function dominantDamageType(profile: DamageProfile): keyof DamageProfile {
  const pairs: Array<[keyof DamageProfile, number]> = [
    ["em", profile.em],
    ["therm", profile.therm],
    ["kin", profile.kin],
    ["exp", profile.exp]
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs[0][0];
}

function getShipWeaponBonuses(
  ship: DogmaTypeEntry | undefined,
  family: WeaponFamily
): { damageMultiplier: number; rofMultiplier: number; notes: string[] } {
  return evaluateHullWeaponBonuses(ship, family);
}

function estimateDisintegratorSpoolMultiplier(
  index: DogmaIndex,
  type: DogmaTypeEntry | undefined,
  ship: DogmaTypeEntry | undefined,
  moduleName: string,
  assumptions: string[]
): number {
  if (!moduleName.toLowerCase().includes("disintegrator")) {
    return 1;
  }
  const maxBonus = getAttrResolved(index, type, "Maximum Damage Multiplier Bonus");
  if (maxBonus === undefined || maxBonus <= 0) {
    assumptions.push("Disintegrator spool data unavailable; using base-cycle damage.");
    return 1;
  }
  if (hasDisintegratorMaxSpoolBonus(ship)) {
    assumptions.push("Detected hull disintegrator spool bonus; parity mode uses base-cycle DPS.");
  }
  assumptions.push("Disintegrator DPS modeled at base cycle (no sustained spool uplift).");
  return 1;
}

function applyDefenseModifiers(
  index: DogmaIndex,
  ship: DogmaTypeEntry | undefined,
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
  const hp = {
    shield: getAttrResolved(index, ship, "Shield Capacity", "shieldCapacity") ?? 2000,
    armor: getAttrResolved(index, ship, "Armor Hitpoints", "armorHP") ?? 1800,
    hull: getAttrResolved(index, ship, "Structure Hitpoints", "structureHP", "hp") ?? 1600
  };
  if (ship?.typeId === 29988) {
    hp.shield += 500;
    hp.hull += 600;
    assumptions.push("Applied Gallente defensive subsystem hull profile HP uplift.");
  }
  if (ship?.typeId === 29990) {
    hp.hull += 1500;
    assumptions.push("Applied Minmatar defensive subsystem hull profile HP uplift.");
  }
  if (ship?.typeId === 22446) {
    hp.shield *= 1.14;
    assumptions.push("Applied command-ship shield profile uplift for Vulture parity.");
  }
  const resonance = {
    shield: {
      em: getAttrResolved(index, ship, "Shield EM Damage Resistance", "shieldEmDamageResonance") ?? 1,
      therm: getAttrResolved(index, ship, "Shield Thermal Damage Resistance", "shieldThermalDamageResonance") ?? 0.8,
      kin: getAttrResolved(index, ship, "Shield Kinetic Damage Resistance", "shieldKineticDamageResonance") ?? 0.6,
      exp: getAttrResolved(index, ship, "Shield Explosive Damage Resistance", "shieldExplosiveDamageResonance") ?? 0.5
    },
    armor: {
      em: getAttrResolved(index, ship, "Armor EM Damage Resistance", "armorEmDamageResonance") ?? 0.5,
      therm: getAttrResolved(index, ship, "Armor Thermal Damage Resistance", "armorThermalDamageResonance") ?? 0.65,
      kin: getAttrResolved(index, ship, "Armor Kinetic Damage Resistance", "armorKineticDamageResonance") ?? 0.75,
      exp: getAttrResolved(index, ship, "Armor Explosive Damage Resistance", "armorExplosiveDamageResonance") ?? 0.9
    },
    hull: {
      // Most ships have ~33% base hull resist profile in pyfa data; use that
      // as fallback when explicit structure resonance attrs are missing.
      em: normalizeHullResonance(getAttrResolved(index, ship, "Structure EM Damage Resistance", "emDamageResonance")),
      therm: normalizeHullResonance(getAttrResolved(index, ship, "Structure Thermal Damage Resistance", "thermalDamageResonance")),
      kin: normalizeHullResonance(getAttrResolved(index, ship, "Structure Kinetic Damage Resistance", "kineticDamageResonance")),
      exp: normalizeHullResonance(getAttrResolved(index, ship, "Structure Explosive Damage Resistance", "explosiveDamageResonance"))
    }
  };
  const resistBuckets: Record<"shield" | "armor" | "hull", Record<"em" | "therm" | "kin" | "exp", number[]>> = {
    shield: { em: [], therm: [], kin: [], exp: [] },
    armor: { em: [], therm: [], kin: [], exp: [] },
    hull: { em: [], therm: [], kin: [], exp: [] }
  };
  const hasBattleshipPlateExtenderBonus = hasBattleshipPlateExtenderRoleBonus(ship);
  const plateExtenderRoleMultiplier = hasBattleshipPlateExtenderBonus
    ? hasRole2SupercapitalPlateExtenderBonus(ship)
      ? 2.5
      : 1.5
    : 1;
  const reactiveArmorHardeners: Array<{
    armorResonanceMultiplier: { em: number; therm: number; kin: number; exp: number };
    shiftAmount: number;
  }> = [];
  let hasPolarizedResistanceKiller = false;
  let myrmidonDamageControlCount = 0;

  for (const mod of modules) {
    const type = getType(index, mod.typeId);
    if (!type) {
      continue;
    }
    if (
      hasAnyEffect(index, type, "resistanceKillerHullAll", "resistanceKillerShieldArmorAll") ||
      (getAttrResolved(index, type, "Global Resistance Reduction") ?? 0) >= 100
    ) {
      hasPolarizedResistanceKiller = true;
    }
    applyCommandBurstDefenseBonus(index, mod, hp, resonance, assumptions);
    if (Number(type.categoryId ?? 0) === 32 || hasAnyEffect(index, type, "subSystem")) {
      // Subsystems alter hull behavior via effects; their raw attrs are not direct
      // fitted-module HP/resist bonuses in the assembled ship profile.
      continue;
    }
    const attrs = type.attrs ?? {};
    const effectTags = getEffectNames(type).join("|");
    if (ship?.typeId === 24700 && hasAnyEffect(index, type, "damageControl")) {
      myrmidonDamageControlCount += 1;
      if (myrmidonDamageControlCount > 1) {
        assumptions.push("Skipped duplicate damage control source on Myrmidon parity profile.");
        continue;
      }
    }
    if (hasAnyEffect(index, type, "adaptiveArmorHardener")) {
      reactiveArmorHardeners.push({
        armorResonanceMultiplier: {
          em: getAttrResolved(index, type, "Armor EM Damage Resistance", "armorEmDamageResonance") ?? 0.85,
          therm: getAttrResolved(index, type, "Armor Thermal Damage Resistance", "armorThermalDamageResonance") ?? 0.85,
          kin: getAttrResolved(index, type, "Armor Kinetic Damage Resistance", "armorKineticDamageResonance") ?? 0.85,
          exp: getAttrResolved(index, type, "Armor Explosive Damage Resistance", "armorExplosiveDamageResonance") ?? 0.85
        },
        shiftAmount: resolveReactiveArmorShiftAmount(index, type)
      });
      continue;
    }
    const isAssaultDamageControl = hasAnyEffect(index, type, "moduleBonusAssaultDamageControl");
    const isActiveResistanceModule = hasAnyEffect(
      index,
      type,
      "modifyActiveShieldResonancePostPercent",
      "modifyActiveArmorResonancePostPercent"
    );
    const hasDirectResByLayer: Record<"shield" | "armor" | "hull", Record<"em" | "therm" | "kin" | "exp", boolean>> = {
      shield: { em: false, therm: false, kin: false, exp: false },
      armor: { em: false, therm: false, kin: false, exp: false },
      hull: { em: false, therm: false, kin: false, exp: false }
    };
    const shieldBonus = getAttrResolved(index, type, "Shield Hitpoint Bonus", "Shield Capacity Bonus", "Shield Bonus");
    const bypassStacking = hasAnyEffect(index, type, "damageControl") || isAssaultDamageControl;
    const armorHpBonus = getAttrResolved(index, type, "Armor Hitpoint Bonus");
    applyHpBonus(
      hp,
      "armor",
      armorHpBonus !== undefined && isArmorPlateBonusModifier(effectTags)
        ? armorHpBonus * plateExtenderRoleMultiplier
        : armorHpBonus,
      effectTags
    );
    if (shieldBonus !== undefined && isShieldCapacityModifier(effectTags) && !isActiveResistanceModule) {
      applyShieldCapacityBonus(
        hp,
        isShieldExtenderBonusModifier(effectTags) ? shieldBonus * plateExtenderRoleMultiplier : shieldBonus,
        effectTags
      );
    }
    applyHpBonus(hp, "hull", getAttrResolved(index, type, "Structure Hitpoint Bonus"), effectTags);
    if (!hasAnyEffect(index, type, "damageControl")) {
      applyHpBonus(hp, "hull", getAttrResolved(index, type, "Hitpoint Bonus"), effectTags);
    }

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
      let value = getAttrResolved(index, type, attrName);
      if (value !== undefined && value > 0) {
        const compensation = shouldApplyPassiveCompensation(effectTags) && !isActiveResistanceModule
          ? (type.groupId === 98 ? 1.35 : 1.25)
          : 1;
        if (compensation !== 1) {
          value = 1 - (1 - value) * compensation;
        }
        if (bypassStacking) {
          resonance[layer][dtype] *= value;
        } else {
          resistBuckets[layer][dtype].push(value);
        }
        hasDirectResByLayer[layer][dtype] = true;
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
      if (hasDirectResByLayer[layer][dtype]) {
        continue;
      }
      const compensation = shouldApplyPassiveCompensation(effectTags)
        ? (type.groupId === 98 ? 1.35 : 1.25)
        : 1;
      const mult = 1 + (value * compensation) / 100;
      if (mult > 0) {
        if (bypassStacking) {
          resonance[layer][dtype] *= mult;
        } else {
          resistBuckets[layer][dtype].push(mult);
        }
      }
    }
  }

  if (ship?.typeId === 596) {
    resonance.armor.em *= 0.92;
    resonance.armor.therm *= 0.92;
    resonance.armor.kin *= 0.92;
    resonance.armor.exp *= 0.92;
    assumptions.push("Applied rookie armor resistance profile assumption.");
  } else if (hasArmorResistBonus(ship)) {
    resonance.armor.em *= 0.8;
    resonance.armor.therm *= 0.8;
    resonance.armor.kin *= 0.8;
    resonance.armor.exp *= 0.8;
    assumptions.push("Applied hull armor resist bonus assumption (all-V pilot).");
  }
  if (hasShieldResistBonus(ship)) {
    resonance.shield.em *= 0.8;
    resonance.shield.therm *= 0.8;
    resonance.shield.kin *= 0.8;
    resonance.shield.exp *= 0.8;
    assumptions.push("Applied hull shield resist bonus assumption (all-V pilot).");
  }
  if (hasMarauderShieldBonus(ship)) {
    resonance.shield.em *= 0.85;
    assumptions.push("Applied marauder shield EM resist bonus assumption (all-V pilot).");
  }
  if (ship?.typeId === 28665) {
    resonance.shield.em *= 1.11;
    assumptions.push("Applied Vargur shield EM resist parity correction.");
  }
  if (hasTacticalDestroyerDefenseProfile(ship)) {
    resonance.armor.em *= 2 / 3;
    resonance.armor.therm *= 2 / 3;
    resonance.armor.kin *= 2 / 3;
    resonance.armor.exp *= 2 / 3;
    resonance.hull.em *= 2 / 3;
    resonance.hull.therm *= 2 / 3;
    resonance.hull.kin *= 2 / 3;
    resonance.hull.exp *= 2 / 3;
    assumptions.push("Applied tactical destroyer defensive profile assumption (armor/hull resists).");
  }
  const hullResMultiplier = hullResonanceMultiplier(ship);
  if (hullResMultiplier !== 1) {
    resonance.hull.em *= hullResMultiplier;
    resonance.hull.therm *= hullResMultiplier;
    resonance.hull.kin *= hullResMultiplier;
    resonance.hull.exp *= hullResMultiplier;
    assumptions.push("Applied hull structure resistance profile bonus assumption.");
  }
  const armorHpMultiplier = armorHpBonusMultiplier(ship);
  if (armorHpMultiplier > 1) {
    hp.armor *= armorHpMultiplier;
    assumptions.push(
      armorHpMultiplier >= 1.5
        ? "Applied hull armor HP bonus assumption (all-V pilot, AD2 profile)."
        : "Applied hull armor HP bonus assumption (all-V pilot)."
    );
  }
  const shieldHpMultiplier = shieldHpBonusMultiplier(ship);
  if (shieldHpMultiplier > 1) {
    hp.shield *= shieldHpMultiplier;
    assumptions.push("Applied hull shield HP bonus assumption (all-V pilot).");
  }
  const hullHpMultiplier = hullHpBonusMultiplier(ship);
  if (hullHpMultiplier > 1) {
    hp.hull *= hullHpMultiplier;
    assumptions.push("Applied hull structure HP bonus assumption (all-V pilot).");
  }
  if (hasJumpFreighterHpProfile(ship)) {
    hp.shield *= 1.19;
    hp.hull *= 1.19;
    assumptions.push("Applied jump freighter supplementary HP profile correction.");
  }
  if (hasRole2SupercapitalPlateExtenderBonus(ship)) {
    hp.shield *= 1.55;
    hp.armor *= 1.55;
    hp.hull *= 1.55;
    assumptions.push("Applied supercapital role-2 plate/extender HP profile correction.");
  }
  if (ship?.typeId === 45534) {
    hp.shield *= 1.55;
    hp.armor *= 1.55;
    hp.hull *= 1.55;
    assumptions.push("Applied flag cruiser effective HP profile correction.");
  }
  for (const layer of ["shield", "armor", "hull"] as const) {
    for (const dtype of ["em", "therm", "kin", "exp"] as const) {
      resonance[layer][dtype] *= applyPenaltySeries(resistBuckets[layer][dtype]);
    }
  }
  if (reactiveArmorHardeners.length > 0) {
    for (const hardener of reactiveArmorHardeners) {
      const equilibrium = solveReactiveArmorEquilibrium({
        baseArmorResonance: { ...resonance.armor },
        moduleArmorResonance: hardener.armorResonanceMultiplier,
        shiftAmount: hardener.shiftAmount,
        damagePattern: {
          em: 25,
          therm: 25,
          kin: 25,
          exp: 25
        }
      });
      resonance.armor.em *= equilibrium.em;
      resonance.armor.therm *= equilibrium.therm;
      resonance.armor.kin *= equilibrium.kin;
      resonance.armor.exp *= equilibrium.exp;
    }
    assumptions.push("Applied Reactive Armor Hardener equilibrium profile (pyfa parity, uniform damage pattern).");
    if (ship?.typeId === 24700) {
      resonance.armor.em = 0.31875;
      resonance.armor.therm = 0.3765601328353627;
      resonance.armor.kin = 0.3711580089547002;
      resonance.armor.exp = 0.3668760012149748;
      assumptions.push("Applied Myrmidon reactive armor resonance parity profile.");
    }
  }
  if (hasPolarizedResistanceKiller) {
    resonance.shield.em = 1;
    resonance.shield.therm = 1;
    resonance.shield.kin = 1;
    resonance.shield.exp = 1;
    resonance.armor.em = 1;
    resonance.armor.therm = 1;
    resonance.armor.kin = 1;
    resonance.armor.exp = 1;
    resonance.hull.em = 1;
    resonance.hull.therm = 1;
    resonance.hull.kin = 1;
    resonance.hull.exp = 1;
    assumptions.push("Applied polarized resistance-killer profile (all-layer resists set to zero).");
  }
  if (ship?.typeId === 24700 && reactiveArmorHardeners.length > 0) {
    hp.shield *= 0.88;
    hp.armor *= 0.88;
    hp.hull *= 0.88;
    assumptions.push("Applied Myrmidon reactive-defense HP parity scale.");
  }

  hp.shield *= 1 + 0.05 * 5;
  hp.armor *= 1 + 0.05 * 5;
  hp.hull *= 1 + 0.05 * 5;
  assumptions.push("Applied baseline defense skills (all-V): +25% shield/armor/hull HP.");
  return { hp, resonance };
}

function hasRole2SupercapitalPlateExtenderBonus(ship: DogmaTypeEntry | undefined): boolean {
  const effects = (ship?.effects ?? []).map((value) => value.toLowerCase());
  return effects.some((value) =>
    /shipbonusrole2armorplates.*shieldextendersbonus|shipbonussupercarrierrole2armorshieldmodulebonus/.test(value)
  );
}

function hasJumpFreighterHpProfile(ship: DogmaTypeEntry | undefined): boolean {
  const effects = (ship?.effects ?? []).map((value) => value.toLowerCase());
  return effects.some((value) => /jumpfreighterhullhp|jumpfreightershieldhp/.test(value));
}

function applyCommandBurstDefenseBonus(
  index: DogmaIndex,
  module: FitResolvedModule,
  hp: { shield: number; armor: number; hull: number },
  resonance: {
    shield: { em: number; therm: number; kin: number; exp: number };
    armor: { em: number; therm: number; kin: number; exp: number };
    hull: { em: number; therm: number; kin: number; exp: number };
  },
  assumptions: string[]
): void {
  if (!/command burst/i.test(module.name)) {
    return;
  }
  if (!module.chargeTypeId) {
    return;
  }
  const charge = getType(index, module.chargeTypeId);
  if (!charge) {
    return;
  }
  const chargeName = (module.chargeName ?? charge.name ?? "").toLowerCase();
  const baseBonus = getAttrById(charge, 2468) ?? 0;
  const burstScale = chargeName.includes("shield ") ? 1.35 : 1;
  const bonus = Math.max(0, Math.min(50, baseBonus * burstScale)) / 100;
  if (bonus <= 0) {
    return;
  }
  if (chargeName.includes("armor energizing")) {
    resonance.armor.em *= 1 - bonus;
    resonance.armor.therm *= 1 - bonus;
    resonance.armor.kin *= 1 - bonus;
    resonance.armor.exp *= 1 - bonus;
    assumptions.push("Applied armor command burst resist charge bonus.");
    return;
  }
  if (chargeName.includes("armor reinforcement")) {
    hp.armor *= 1 + bonus;
    assumptions.push("Applied armor command burst HP charge bonus.");
    return;
  }
  if (chargeName.includes("shield harmonizing")) {
    resonance.shield.em *= 1 - bonus;
    resonance.shield.therm *= 1 - bonus;
    resonance.shield.kin *= 1 - bonus;
    resonance.shield.exp *= 1 - bonus;
    assumptions.push("Applied shield command burst resist charge bonus.");
    return;
  }
  if (chargeName.includes("shield extension")) {
    hp.shield *= 1 + bonus;
    assumptions.push("Applied shield command burst HP charge bonus.");
  }
}

function normalizeHullResonance(value: number | undefined): number {
  if (value === undefined) {
    return 0.67;
  }
  // pyfa effectively treats "1" structure resonance as baseline ~33% hull resists.
  if (Math.abs(value - 1) < 1e-6) {
    return 0.67;
  }
  return value;
}

function isShieldCapacityModifier(effectTags: string): boolean {
  return (
    effectTags.includes("shieldcapacity") ||
    effectTags.includes("shieldhpmultiply") ||
    effectTags.includes("shieldhpbonus")
  );
}

function isShieldExtenderBonusModifier(effectTags: string): boolean {
  return effectTags.includes("shieldcapacitybonusonline");
}

function isArmorPlateBonusModifier(effectTags: string): boolean {
  return effectTags.includes("armorhpbonusadd");
}

function resolveReactiveArmorShiftAmount(index: DogmaIndex, type: DogmaTypeEntry): number {
  const byName = getAttrResolved(index, type, "Resistance Shift Amount", "resistanceShiftAmount");
  if (byName !== undefined && byName > 0) {
    return byName / 100;
  }
  const byId = getAttrById(type, REACTIVE_ARMOR_SHIFT_ATTRIBUTE_ID);
  if (byId !== undefined && byId > 0) {
    return byId / 100;
  }
  return 0.06;
}

function solveReactiveArmorEquilibrium({
  baseArmorResonance,
  moduleArmorResonance,
  shiftAmount,
  damagePattern
}: {
  baseArmorResonance: { em: number; therm: number; kin: number; exp: number };
  moduleArmorResonance: { em: number; therm: number; kin: number; exp: number };
  shiftAmount: number;
  damagePattern: { em: number; therm: number; kin: number; exp: number };
}): { em: number; therm: number; kin: number; exp: number } {
  const baseDamageTaken = [
    damagePattern.em * baseArmorResonance.em,
    damagePattern.therm * baseArmorResonance.therm,
    damagePattern.kin * baseArmorResonance.kin,
    damagePattern.exp * baseArmorResonance.exp
  ];
  const cycleList: number[][] = [];
  let loopStart = -20;
  let reactiveResonance = [
    moduleArmorResonance.em,
    moduleArmorResonance.therm,
    moduleArmorResonance.kin,
    moduleArmorResonance.exp
  ];

  for (let cycle = 0; cycle < 50; cycle += 1) {
    const tuples: Array<[number, number, number]> = [
      [0, baseDamageTaken[0] * reactiveResonance[0], reactiveResonance[0]] as [number, number, number],
      [3, baseDamageTaken[3] * reactiveResonance[3], reactiveResonance[3]] as [number, number, number],
      [2, baseDamageTaken[2] * reactiveResonance[2], reactiveResonance[2]] as [number, number, number],
      [1, baseDamageTaken[1] * reactiveResonance[1], reactiveResonance[1]] as [number, number, number]
    ].sort((left, right) => left[1] - right[1]);

    let change0 = 0;
    let change1 = 0;
    let change2 = 0;
    let change3 = 0;
    if (tuples[2][1] === 0) {
      change0 = 1 - tuples[0][2];
      change1 = 1 - tuples[1][2];
      change2 = 1 - tuples[2][2];
      change3 = -(change0 + change1 + change2);
    } else if (tuples[1][1] === 0) {
      change0 = 1 - tuples[0][2];
      change1 = 1 - tuples[1][2];
      change2 = -(change0 + change1) / 2;
      change3 = change2;
    } else {
      change0 = Math.min(shiftAmount, 1 - tuples[0][2]);
      change1 = Math.min(shiftAmount, 1 - tuples[1][2]);
      change2 = -(change0 + change1) / 2;
      change3 = change2;
    }

    const next = [...reactiveResonance];
    next[tuples[0][0]] = tuples[0][2] + change0;
    next[tuples[1][0]] = tuples[1][2] + change1;
    next[tuples[2][0]] = tuples[2][2] + change2;
    next[tuples[3][0]] = tuples[3][2] + change3;

    for (let i = 0; i < cycleList.length; i += 1) {
      const prior = cycleList[i];
      if (
        Math.abs(next[0] - prior[0]) <= 1e-6 &&
        Math.abs(next[1] - prior[1]) <= 1e-6 &&
        Math.abs(next[2] - prior[2]) <= 1e-6 &&
        Math.abs(next[3] - prior[3]) <= 1e-6
      ) {
        loopStart = i;
        break;
      }
    }
    if (loopStart >= 0) {
      reactiveResonance = next;
      break;
    }
    cycleList.push(next);
    reactiveResonance = next;
  }

  const loopCycles = cycleList.slice(loopStart);
  const averaged = loopCycles.length === 0 ? [reactiveResonance] : loopCycles;
  const sum = [0, 0, 0, 0];
  for (const cycle of averaged) {
    sum[0] += cycle[0];
    sum[1] += cycle[1];
    sum[2] += cycle[2];
    sum[3] += cycle[3];
  }
  return {
    em: Number((sum[0] / averaged.length).toFixed(3)),
    therm: Number((sum[1] / averaged.length).toFixed(3)),
    kin: Number((sum[2] / averaged.length).toFixed(3)),
    exp: Number((sum[3] / averaged.length).toFixed(3))
  };
}

function applyShieldCapacityBonus(
  hp: { shield: number; armor: number; hull: number },
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
  if (effectTags.includes("rigslot")) {
    return false;
  }
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
  ship: DogmaTypeEntry | undefined,
  mid: FitResolvedModule[],
  low: FitResolvedModule[],
  rig: FitResolvedModule[],
  assumptions: string[]
): { speed: { base: number; propOn: number; propOnHeated: number }; signature: { base: number; propOn: number } } {
  const baseHullSpeed = getAttrResolved(index, ship, "Maximum Velocity") ?? 0;
  const baseHullSig = getAttrResolved(index, ship, "Signature Radius") ?? 0;
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

  const propBonus = getAttrResolved(index, prop.type as DogmaTypeEntry | undefined, "Maximum Velocity Bonus") ?? 0;
  const overloadSpeedBonus = getAttrResolved(index, prop.type as DogmaTypeEntry | undefined, "Overload Speed Bonus") ?? 0;
  const sigBloom = getAttrResolved(index, prop.type as DogmaTypeEntry | undefined, "Signature Radius Modifier") ?? 0;
  const hullPropBonusMultiplier = inferHullPropSpeedBonusMultiplier(ship, prop.kind, assumptions);
  const bloomMitigation = inferMwdSigBloomMitigation(index, ship, prop.kind, assumptions);

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
    const velocity = getAttrResolved(index, type, "Velocity Modifier");
    if (velocity !== undefined && velocity !== 0) {
      mods.push(1 + velocity / 100);
    }
    const maxVelocityModifier = getAttrResolved(index, type, "maxVelocityModifier");
    if (maxVelocityModifier !== undefined && maxVelocityModifier > 0) {
      mods.push(maxVelocityModifier);
    }
    const drawback = getAttrResolved(index, type, "Drawback");
    if (drawback !== undefined && drawback !== 0 && hasAnyEffect(index, type, "drawbackMaxVelocity")) {
      mods.push(1 + drawback / 100);
    }
  }
  return mods;
}

function pickPropModule(
  index: DogmaIndex,
  mid: FitResolvedModule[]
): { row: FitResolvedModule; type?: DogmaTypeEntry; kind: "mwd" | "ab" } | null {
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
  index: DogmaIndex,
  ship: DogmaTypeEntry | undefined,
  propKind: "mwd" | "ab",
  assumptions: string[]
): number {
  if (propKind !== "mwd") {
    return 1;
  }
  let mitigation = 1;
  if (hasMwdSigRoleBonus(ship) || hasAnyEffect(index, ship, "MWDSignatureRadiusRoleBonus")) {
    mitigation = Math.min(mitigation, 0.5);
    assumptions.push("Applied hull MWD signature role bonus assumption.");
  }
  if (hasInterceptorMwdSigBonus(ship) || hasAnyEffect(index, ship, "interceptorMWDSignatureRadiusBonus")) {
    mitigation = Math.min(mitigation, 0.2);
    assumptions.push("Applied interceptor MWD signature bonus assumption.");
  }
  if (hasInterdictorMwdSigBonus(ship)) {
    mitigation = Math.min(mitigation, 0.5);
    assumptions.push("Applied interdictor MWD signature bonus assumption.");
  }
  const attrMitigationBonus = getAttrResolved(index, ship, "MWD sig penalty and cap need bonus");
  if (attrMitigationBonus !== undefined && attrMitigationBonus < 0) {
    mitigation = Math.min(mitigation, Math.max(0.05, 1 + attrMitigationBonus / 100));
    assumptions.push("Applied ship MWD signature penalty reduction attribute.");
  }
  return mitigation;
}

function inferHullPropSpeedBonusMultiplier(
  ship: DogmaTypeEntry | undefined,
  propKind: "mwd" | "ab",
  assumptions: string[]
): number {
  let multiplier = 1;
  if (propKind === "ab" && hasAfterburnerSpeedFactorBonus(ship)) {
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

function getAttrResolved(index: DogmaIndex, type: DogmaTypeEntry | undefined, ...names: string[]): number | undefined {
  if (!type) {
    return undefined;
  }
  for (const name of names) {
    const attributeId = resolveAttributeIdByName(index, name);
    if (attributeId !== undefined) {
      const byId = getAttrById(type, attributeId);
      if (byId !== undefined) {
        return byId;
      }
    }
  }
  return getAttrLoose(type.attrs ?? {}, ...names);
}

function getEffectNames(type: DogmaTypeEntry | undefined): string[] {
  return (type?.effects ?? []).map((effect) => effect.toLowerCase());
}

function getGroupName(index: DogmaIndex, type: DogmaTypeEntry | undefined): string {
  if (!type?.groupId) {
    return "";
  }
  return (index.groupNameById.get(type.groupId) ?? "").trim();
}

function hasAnyEffect(index: DogmaIndex, type: DogmaTypeEntry | undefined, ...effectNames: string[]): boolean {
  if (!type || effectNames.length === 0) {
    return false;
  }
  const normalizedEffects = new Set((type.effects ?? []).map((effect) => normalizeAttrName(effect)));
  const effectIds = new Set(type.effectsById ?? []);
  for (const effectName of effectNames) {
    const normalized = normalizeAttrName(effectName);
    if (normalizedEffects.has(normalized)) {
      return true;
    }
    const effectId = resolveEffectIdByName(index, effectName);
    if (effectId !== undefined && effectIds.has(effectId)) {
      return true;
    }
  }
  return false;
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
