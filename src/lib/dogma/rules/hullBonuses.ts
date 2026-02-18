import type { DogmaTypeEntry } from "../types";

export type WeaponFamily = "hybrid" | "projectile" | "energy" | "missile" | "disintegrator" | "other";

export type HullWeaponBonusResult = {
  damageMultiplier: number;
  rofMultiplier: number;
  notes: string[];
};

type WeaponRule = {
  family: WeaponFamily;
  effectPattern: RegExp;
  damageMultiplier?: number;
  rofMultiplier?: number;
  note: string;
};

const WEAPON_RULES: WeaponRule[] = [
  { family: "hybrid", effectPattern: /shiphybriddmgpiratecruiser/i, damageMultiplier: 1.25, rofMultiplier: 0.8, note: "Applied pirate cruiser hybrid profile assumption (all-V pilot)." },
  { family: "hybrid", effectPattern: /shiphybriddmg1gbc1/i, damageMultiplier: 1.375, note: "Applied command-ship hybrid damage profile assumption (all-V pilot)." },
  { family: "hybrid", effectPattern: /elitebonuscommandshipmediumhybriddamagecs2/i, damageMultiplier: 1.2, note: "Applied command-ship medium hybrid damage profile assumption (all-V pilot)." },
  { family: "hybrid", effectPattern: /shipbonuspiratesmallhybriddmg/i, damageMultiplier: 1.333333, note: "Applied tactical destroyer small hybrid damage profile assumption (all-V pilot)." },
  { family: "hybrid", effectPattern: /shipshtrof/i, rofMultiplier: 0.666667, note: "Applied tactical destroyer small hybrid ROF profile assumption (all-V pilot)." },
  { family: "hybrid", effectPattern: /hybriddamage/i, damageMultiplier: 1.25, note: "Applied hull hybrid damage bonus assumption (all-V pilot)." },
  { family: "hybrid", effectPattern: /hybridrof/i, rofMultiplier: 0.5, note: "Applied hull hybrid ROF bonus assumption (all-V pilot)." },
  { family: "projectile", effectPattern: /projectilerof/i, rofMultiplier: 0.75, note: "Applied hull projectile ROF bonus assumption (all-V pilot)." },
  { family: "projectile", effectPattern: /elitebonusviolatorslargeprojectileturretdamagerole1/i, damageMultiplier: 2.0, note: "Applied marauder large projectile role damage profile assumption." },
  { family: "projectile", effectPattern: /shipptdamagebonusmb2/i, damageMultiplier: 1.375, note: "Applied marauder projectile skill damage profile assumption (all-V pilot)." },
  { family: "projectile", effectPattern: /subsystembonusminmataroffensive2projectileweapondamagemultiplier/i, damageMultiplier: 1.875, note: "Applied T3 projectile subsystem damage profile assumption (all-V pilot)." },
  { family: "projectile", effectPattern: /shippdmgbonus/i, damageMultiplier: 1.25, note: "Applied hull projectile damage bonus assumption (all-V pilot)." },
  { family: "projectile", effectPattern: /projectiledamage/i, damageMultiplier: 1.25, note: "Applied hull projectile damage bonus assumption (all-V pilot)." },
  { family: "energy", effectPattern: /energyrof/i, rofMultiplier: 0.75, note: "Applied hull laser ROF bonus assumption (all-V pilot)." },
  { family: "energy", effectPattern: /energydamage/i, damageMultiplier: 1.25, note: "Applied hull laser damage bonus assumption (all-V pilot)." },
  { family: "missile", effectPattern: /subsystembonusminmataroffensive2missilelauncherrof/i, rofMultiplier: 0.45, note: "Applied T3 Minmatar subsystem missile ROF profile assumption (all-V pilot)." },
  { family: "missile", effectPattern: /subsystembonuscaldarioffensive1launcherrof/i, rofMultiplier: 0.56, note: "Applied T3 Caldari subsystem missile ROF profile assumption (all-V pilot)." },
  { family: "missile", effectPattern: /subsystembonusamarroffensivemissilelauncherrof/i, rofMultiplier: 0.675, note: "Applied T3 Amarr subsystem missile ROF profile assumption (all-V pilot)." },
  { family: "missile", effectPattern: /shipmissilelauncherrofad1fixed/i, rofMultiplier: 0.675, note: "Applied destroyer/interdictor missile ROF profile assumption (all-V pilot)." },
  { family: "missile", effectPattern: /shipbonus(kinetic|thermal)missiledamagegc2/i, damageMultiplier: 1.25, note: "Applied pirate cruiser missile damage profile assumption (all-V pilot)." },
  { family: "missile", effectPattern: /shipbonuselitecover2torpedoexplosivedamage/i, damageMultiplier: 1.75, note: "Applied stealth bomber torpedo damage profile assumption (all-V pilot)." },
  { family: "missile", effectPattern: /shipbonusdreadnoughtc1damagebonus/i, damageMultiplier: 1.25, note: "Applied dreadnought missile damage profile assumption (all-V pilot)." },
  { family: "missile", effectPattern: /shipbonusdreadnoughtc3reloadbonus/i, rofMultiplier: 0.75, note: "Applied dreadnought missile reload/ROF profile assumption (all-V pilot)." },
  { family: "hybrid", effectPattern: /shipbonustitang1damagebonus/i, damageMultiplier: 9.0, note: "Applied titan hybrid role damage profile assumption." },
  { family: "hybrid", effectPattern: /shipbonustitang2rofbonus/i, rofMultiplier: 0.6, note: "Applied titan hybrid ROF profile assumption." },
  { family: "hybrid", effectPattern: /shipbonusdreadnoughtg2rofbonus/i, rofMultiplier: 0.75, note: "Applied lancer dreadnought hybrid ROF profile assumption." },
  { family: "missile", effectPattern: /(shipmissilerofcc|shipcruiselauncherrofbonus2cb|shipsiegelauncherrofbonus2cb|shipbonusrhmlrof2cb)/i, rofMultiplier: 0.75, note: "Applied hull missile ROF bonus assumption (all-V pilot)." },
  { family: "missile", effectPattern: /missiledamage/i, damageMultiplier: 1.25, note: "Applied hull missile damage bonus assumption (all-V pilot)." },
  { family: "disintegrator", effectPattern: /shipbonuspctdamagepf/i, damageMultiplier: 1.5, note: "Applied hull disintegrator damage bonus assumption (all-V pilot)." }
];

export function evaluateHullWeaponBonuses(ship: DogmaTypeEntry | undefined, family: WeaponFamily): HullWeaponBonusResult {
  const result: HullWeaponBonusResult = {
    damageMultiplier: 1,
    rofMultiplier: 1,
    notes: []
  };

  const effects = (ship?.effects ?? []).map((effect) => effect.toLowerCase());
  for (const rule of WEAPON_RULES) {
    if (rule.family !== family) {
      continue;
    }
    if (!effects.some((effect) => rule.effectPattern.test(effect))) {
      continue;
    }
    if (rule.damageMultiplier !== undefined) {
      result.damageMultiplier *= rule.damageMultiplier;
    }
    if (rule.rofMultiplier !== undefined) {
      result.rofMultiplier *= rule.rofMultiplier;
    }
    result.notes.push(rule.note);
  }

  return result;
}
