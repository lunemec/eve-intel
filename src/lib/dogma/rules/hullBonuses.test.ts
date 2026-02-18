import { describe, expect, it } from "vitest";
import { evaluateHullWeaponBonuses } from "./hullBonuses";

const mk = (effects: string[]) => ({ typeId: 1, name: "Ship", attrs: {}, effects });

describe("hullBonuses", () => {
  it("matches missile launcher ROF patterns", () => {
    const raven = mk(["shipCruiseLauncherROFBonus2CB"]);
    const bonus = evaluateHullWeaponBonuses(raven, "missile");
    expect(bonus.rofMultiplier).toBeCloseTo(0.75, 6);
  });

  it("uses AD1 fixed missile ROF profile without double counting", () => {
    const heretic = mk(["shipMissileLauncherRoFAD1Fixed"]);
    const bonus = evaluateHullWeaponBonuses(heretic, "missile");
    expect(bonus.rofMultiplier).toBeCloseTo(0.675, 6);
  });

  it("matches projectile damage bonus shorthand patterns", () => {
    const wolf = mk(["shipPDmgBonusMF"]);
    const bonus = evaluateHullWeaponBonuses(wolf, "projectile");
    expect(bonus.damageMultiplier).toBeCloseTo(1.25, 6);
  });

  it("uses tuned pirate hybrid profile", () => {
    const gnosis = mk(["shipHybridDmgPirateCruiser"]);
    const bonus = evaluateHullWeaponBonuses(gnosis, "hybrid");
    expect(bonus.damageMultiplier).toBeCloseTo(1.25, 6);
    expect(bonus.rofMultiplier).toBeCloseTo(0.8, 6);
  });

  it("matches tactical destroyer small hybrid offense profile effects", () => {
    const hecate = mk(["shipBonusPirateSmallHybridDmg", "shipSHTRoFGallenteTacticalDestroyer1"]);
    const bonus = evaluateHullWeaponBonuses(hecate, "hybrid");
    expect(bonus.damageMultiplier).toBeCloseTo(1.333333, 6);
    expect(bonus.rofMultiplier).toBeCloseTo(0.666667, 6);
  });

  it("matches strategic cruiser subsystem projectile damage and missile ROF patterns", () => {
    const loki = mk(["subsystemBonusMinmatarOffensive2ProjectileWeaponDamageMultiplier"]);
    const lokiBonus = evaluateHullWeaponBonuses(loki, "projectile");
    expect(lokiBonus.damageMultiplier).toBeCloseTo(1.875, 6);

    const tengu = mk(["subsystemBonusCaldariOffensive1LauncherROF"]);
    const tenguBonus = evaluateHullWeaponBonuses(tengu, "missile");
    expect(tenguBonus.rofMultiplier).toBeCloseTo(0.56, 6);
  });

  it("matches command-ship hybrid damage and minmatar subsystem missile ROF patterns", () => {
    const astarte = mk(["shipHybridDmg1GBC1"]);
    const astarteBonus = evaluateHullWeaponBonuses(astarte, "hybrid");
    expect(astarteBonus.damageMultiplier).toBeCloseTo(1.375, 6);

    const loki = mk(["subsystemBonusMinmatarOffensive2MissileLauncherROF"]);
    const lokiBonus = evaluateHullWeaponBonuses(loki, "missile");
    expect(lokiBonus.rofMultiplier).toBeCloseTo(0.45, 6);
  });

  it("matches command-ship medium hybrid damage profile pattern", () => {
    const vulture = mk(["eliteBonusCommandShipMediumHybridDamageCS2"]);
    const bonus = evaluateHullWeaponBonuses(vulture, "hybrid");
    expect(bonus.damageMultiplier).toBeCloseTo(1.5, 6);
  });

  it("matches marauder projectile role and hull projectile damage patterns", () => {
    const vargur = mk([
      "eliteBonusViolatorsLargeProjectileTurretDamageRole1",
      "shipPTdamageBonusMB2"
    ]);
    const bonus = evaluateHullWeaponBonuses(vargur, "projectile");
    expect(bonus.damageMultiplier).toBeCloseTo(2.75, 6);
  });

  it("matches pirate cruiser missile kinetic/thermal damage profile patterns", () => {
    const gila = mk(["shipBonusKineticMissileDamageGC2"]);
    const bonus = evaluateHullWeaponBonuses(gila, "missile");
    expect(bonus.damageMultiplier).toBeCloseTo(1.5625, 6);
  });

  it("matches stealth bomber torpedo damage profile effect", () => {
    const hound = mk(["shipBonusEliteCover2TorpedoExplosiveDamage"]);
    const bonus = evaluateHullWeaponBonuses(hound, "missile");
    expect(bonus.damageMultiplier).toBeCloseTo(1.75, 6);
  });

  it("matches dreadnought and titan profile effects", () => {
    const phoenix = mk(["shipBonusDreadnoughtC1DamageBonus", "shipBonusDreadnoughtC3ReloadBonus"]);
    const phoenixBonus = evaluateHullWeaponBonuses(phoenix, "missile");
    expect(phoenixBonus.damageMultiplier).toBeCloseTo(1.25, 6);
    expect(phoenixBonus.rofMultiplier).toBeCloseTo(0.75, 6);

    const erebus = mk(["shipBonusTitanG1DamageBonus", "shipBonusTitanG2ROFBonus"]);
    const erebusBonus = evaluateHullWeaponBonuses(erebus, "hybrid");
    expect(erebusBonus.damageMultiplier).toBeCloseTo(9, 6);
    expect(erebusBonus.rofMultiplier).toBeCloseTo(0.6, 6);
  });

});
