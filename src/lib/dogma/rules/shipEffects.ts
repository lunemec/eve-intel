import type { DogmaTypeEntry } from "../types";

function names(ship: DogmaTypeEntry | undefined): Set<string> {
  return new Set((ship?.effects ?? []).map((value) => normalize(value)));
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasByExact(ship: DogmaTypeEntry | undefined, ...effectNames: string[]): boolean {
  const set = names(ship);
  return effectNames.some((name) => set.has(normalize(name)));
}

function hasByPattern(ship: DogmaTypeEntry | undefined, pattern: RegExp): boolean {
  return (ship?.effects ?? []).some((value) => pattern.test(value));
}

export function hasRookieDroneDamageBonus(ship: DogmaTypeEntry | undefined): boolean {
  return hasByExact(ship, "shipBonusDroneDamageMultiplierRookie");
}

export function hasPirateMediumDroneRoleBonus(ship: DogmaTypeEntry | undefined): boolean {
  return hasByExact(ship, "shipBonusMediumDroneDamageMultiplierPirateFaction");
}

export function hasDisintegratorMaxSpoolBonus(ship: DogmaTypeEntry | undefined): boolean {
  return hasByExact(ship, "shipDmgMultiMaxEliteGunship1");
}

export function hasArmorResistBonus(ship: DogmaTypeEntry | undefined): boolean {
  if (
    hasByExact(
      ship,
      "eliteIndustrialArmorResists2",
      "eliteBonusInterdictorsArmorResist1",
      "shipBonusArmorResistAB",
      "shipBonusDreadnoughtA2ArmorResists"
    )
  ) {
    return true;
  }
  return (
    hasByPattern(ship, /armorresists/i) ||
    hasByPattern(ship, /armorresist(?!ance)/i) ||
    hasByPattern(ship, /armor[a-z]*resistance/i) ||
    hasByPattern(ship, /shiparmorresistance[a-z]+\d+/i) ||
    hasByPattern(ship, /shiparmor[a-z]+resistancecc\d+/i) ||
    hasByPattern(ship, /shiparmor[a-z]+resistancepf\d+/i)
  );
}

export function hasShieldResistBonus(ship: DogmaTypeEntry | undefined): boolean {
  if (hasByExact(ship, "shipBonusShieldResistAB", "eliteIndustrialShieldResists2")) {
    return true;
  }
  return (
    hasByPattern(ship, /shieldresists/i) ||
    hasByPattern(ship, /shieldresist(?!ance)/i) ||
    hasByPattern(ship, /shield[a-z]*resistance/i) ||
    hasByPattern(ship, /shipshield[a-z]+resistancecc\d+/i) ||
    hasByPattern(ship, /shipshield[a-z]+resistance\d+[a-z]+\d+/i) ||
    hasByPattern(ship, /shipbonus[a-z]+shieldresistance[a-z]+\d+/i) ||
    hasByPattern(ship, /shipshieldresistancebonus[a-z]+\d+/i)
  );
}

export function hullResonanceMultiplier(ship: DogmaTypeEntry | undefined): number {
  if (hasByPattern(ship, /elitebonusflagcruiserallresistances/i)) {
    return 0.8;
  }
  if (hasByPattern(ship, /shipbonusdreadnoughtg1hullresonance/i)) {
    return 0.75;
  }
  return 1;
}

export function armorHpBonusMultiplier(ship: DogmaTypeEntry | undefined): number {
  if (hasByExact(ship, "shipBonusArmorHPAD2")) {
    return 1.65;
  }
  if (hasByPattern(ship, /armorhp/i)) {
    return 1.25;
  }
  return 1;
}

export function shieldHpBonusMultiplier(ship: DogmaTypeEntry | undefined): number {
  if (hasByExact(ship, "subsystemBonusCaldariDefensiveShieldHP")) {
    return 1.5;
  }
  if (hasByExact(ship, "shipBonusShieldHpCF2")) {
    return 1.375;
  }
  if (hasByPattern(ship, /jumpfreightershieldhp/i)) {
    return 1.25;
  }
  if (hasByPattern(ship, /shieldextendercapacitybonus/i)) {
    return 1.12;
  }
  if (hasByPattern(ship, /commandshipshieldhp/i)) {
    return 1.4;
  }
  return 1;
}

export function hullHpBonusMultiplier(ship: DogmaTypeEntry | undefined): number {
  if (hasByPattern(ship, /jumpfreighterhullhp/i)) {
    return 1.25;
  }
  return 1;
}

export function hasMwdSigRoleBonus(ship: DogmaTypeEntry | undefined): boolean {
  return hasByExact(ship, "MWDSignatureRadiusRoleBonus");
}

export function hasInterceptorMwdSigBonus(ship: DogmaTypeEntry | undefined): boolean {
  return hasByExact(ship, "interceptorMWDSignatureRadiusBonus");
}

export function hasInterdictorMwdSigBonus(ship: DogmaTypeEntry | undefined): boolean {
  return hasByExact(ship, "eliteBonusInterdictorsMWDSigRadius2") || hasByPattern(ship, /interdictorsmwdsigradius/i);
}

export function hasAfterburnerSpeedFactorBonus(ship: DogmaTypeEntry | undefined): boolean {
  return hasByPattern(ship, /afterburnerspeedfactor/i);
}

export function hasTacticalDestroyerArmorDefenseBonus(ship: DogmaTypeEntry | undefined): boolean {
  const family = tacticalDestroyerFamily(ship);
  return family === "gallente" || family === "amarr" || family === "minmatar";
}

export function hasTacticalDestroyerShieldDefenseBonus(ship: DogmaTypeEntry | undefined): boolean {
  const family = tacticalDestroyerFamily(ship);
  return family === "caldari" || family === "minmatar";
}

export function hasTacticalDestroyerHullDefenseBonus(ship: DogmaTypeEntry | undefined): boolean {
  return tacticalDestroyerFamily(ship) === "gallente";
}

export function hasTacticalDestroyerDefenseProfile(ship: DogmaTypeEntry | undefined): boolean {
  return (
    hasTacticalDestroyerArmorDefenseBonus(ship) ||
    hasTacticalDestroyerShieldDefenseBonus(ship) ||
    hasTacticalDestroyerHullDefenseBonus(ship)
  );
}

export function hasBattleshipPlateExtenderRoleBonus(ship: DogmaTypeEntry | undefined): boolean {
  return (
    hasByPattern(ship, /armorplate.*shieldextenderhp/i) ||
    hasByPattern(ship, /armorplates.*shieldextenders.*bonus/i)
  );
}

export function hasMarauderShieldBonus(ship: DogmaTypeEntry | undefined): boolean {
  return hasByPattern(ship, /maraudershieldbonus/i);
}

function tacticalDestroyerFamily(
  ship: DogmaTypeEntry | undefined
): "gallente" | "caldari" | "amarr" | "minmatar" | null {
  if (hasByPattern(ship, /gallentetacticaldestroyer/i)) {
    return "gallente";
  }
  if (hasByPattern(ship, /caldaritacticaldestroyer/i)) {
    return "caldari";
  }
  if (hasByPattern(ship, /amarrtacticaldestroyer/i)) {
    return "amarr";
  }
  if (hasByPattern(ship, /minmatartacticaldestroyer/i)) {
    return "minmatar";
  }
  return null;
}
