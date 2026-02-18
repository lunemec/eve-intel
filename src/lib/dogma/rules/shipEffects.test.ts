import { describe, expect, it } from "vitest";
import {
  armorHpBonusMultiplier,
  hasAfterburnerSpeedFactorBonus,
  hasArmorResistBonus,
  hasDisintegratorMaxSpoolBonus,
  hullHpBonusMultiplier,
  hullResonanceMultiplier,
  hasInterdictorMwdSigBonus,
  hasInterceptorMwdSigBonus,
  hasMwdSigRoleBonus,
  hasPirateMediumDroneRoleBonus,
  hasRookieDroneDamageBonus,
  hasShieldResistBonus,
  shieldHpBonusMultiplier,
  hasTacticalDestroyerDefenseProfile,
  hasBattleshipPlateExtenderRoleBonus,
  hasMarauderShieldBonus
} from "./shipEffects";

const mk = (effects: string[]) => ({ typeId: 1, name: "Ship", attrs: {}, effects });

describe("shipEffects rules", () => {
  it("matches explicit drone/disintegrator effects", () => {
    const ship = mk(["shipBonusDroneDamageMultiplierRookie", "shipDmgMultiMaxEliteGunship1"]);
    expect(hasRookieDroneDamageBonus(ship)).toBe(true);
    expect(hasDisintegratorMaxSpoolBonus(ship)).toBe(true);
  });

  it("matches pirate medium drone role effect", () => {
    const ship = mk(["shipBonusMediumDroneDamageMultiplierPirateFaction"]);
    expect(hasPirateMediumDroneRoleBonus(ship)).toBe(true);
  });

  it("matches defensive/prop effect families", () => {
    const ship = mk([
      "eliteIndustrialArmorResists2",
      "eliteIndustrialShieldResists2",
      "MWDSignatureRadiusRoleBonus",
      "interceptorMWDSignatureRadiusBonus",
      "eliteBonusInterdictorsMWDSigRadius2",
      "shipBonusAfterburnerSpeedFactorCF2",
      "shipBonusArmorHPAD2"
    ]);
    expect(hasArmorResistBonus(ship)).toBe(true);
    expect(hasShieldResistBonus(ship)).toBe(true);
    expect(hasMwdSigRoleBonus(ship)).toBe(true);
    expect(hasInterceptorMwdSigBonus(ship)).toBe(true);
    expect(hasInterdictorMwdSigBonus(ship)).toBe(true);
    expect(hasAfterburnerSpeedFactorBonus(ship)).toBe(true);
    expect(armorHpBonusMultiplier(ship)).toBe(1.65);
  });

  it("matches resistance CC2 style ship effects", () => {
    const ship = mk([
      "shipShieldEMResistanceCC2",
      "shipShieldThermalResistanceCC2",
      "shipShieldKineticResistanceCC2",
      "shipShieldExplosiveResistanceCC2",
      "shipArmorEMResistanceCC2",
      "shipArmorThermalResistanceCC2"
    ]);
    expect(hasShieldResistBonus(ship)).toBe(true);
    expect(hasArmorResistBonus(ship)).toBe(true);
  });

  it("matches shield resistance CBC style effects", () => {
    const ship = mk([
      "shipShieldEmResistance1CBC2",
      "shipShieldThermalResistance1CBC2"
    ]);
    expect(hasShieldResistBonus(ship)).toBe(true);
  });

  it("matches bonus/pattern shield resistance effects", () => {
    const ship = mk([
      "shipBonusEmShieldResistanceCB2",
      "shipShieldResistanceBonusMBC1"
    ]);
    expect(hasShieldResistBonus(ship)).toBe(true);
  });

  it("matches resistance PF style armor effects", () => {
    const ship = mk([
      "shipArmorEMResistancePF2",
      "shipArmorThermResistancePF2",
      "shipArmorKinResistancePF2",
      "shipArmorExpResistancePF2"
    ]);
    expect(hasArmorResistBonus(ship)).toBe(true);
  });

  it("matches interceptor AF-style armor resistance effect", () => {
    const ship = mk(["shipArmorResistanceAF1"]);
    expect(hasArmorResistBonus(ship)).toBe(true);
  });

  it("detects tactical destroyer defense profile family", () => {
    const ship = mk(["shipHeatDamageGallenteTacticalDestroyer3"]);
    expect(hasTacticalDestroyerDefenseProfile(ship)).toBe(true);
  });

  it("detects battleship plate/extender role bonus family", () => {
    const ship = mk(["BattleshipRoleBonusArmorPlate&ShieldExtenderHP"]);
    expect(hasBattleshipPlateExtenderRoleBonus(ship)).toBe(true);
  });

  it("detects marauder shield bonus family", () => {
    const ship = mk(["eliteBonusMarauderShieldBonus2a"]);
    expect(hasMarauderShieldBonus(ship)).toBe(true);
  });

  it("matches shield HP role bonus effect", () => {
    const ship = mk(["shipBonusShieldHpCF2"]);
    expect(shieldHpBonusMultiplier(ship)).toBe(1.375);
  });

  it("matches logistics shield extender capacity bonus effect", () => {
    const ship = mk(["shipBonusShieldExtenderCapacityBonusEliteBonusLogistics4"]);
    expect(shieldHpBonusMultiplier(ship)).toBe(1.12);
  });

  it("matches command ship shield hp effect", () => {
    const ship = mk(["eliteBonusCommandShipShieldHPCS1"]);
    expect(shieldHpBonusMultiplier(ship)).toBe(1.4);
  });

  it("matches rookie resistance naming variants", () => {
    const ship = mk(["shipArmorEMResistanceRookie", "shipShieldEMResistanceRookie"]);
    expect(hasArmorResistBonus(ship)).toBe(true);
    expect(hasShieldResistBonus(ship)).toBe(true);
  });

  it("matches jump freighter hull/shield HP bonus effects", () => {
    const ship = mk(["eliteBonusJumpFreighterHullHP1", "eliteBonusJumpFreighterShieldHP1"]);
    expect(hullHpBonusMultiplier(ship)).toBe(1.25);
    expect(shieldHpBonusMultiplier(ship)).toBe(1.25);
  });

  it("matches hull resonance multipliers for flag cruiser and lancer dread effects", () => {
    expect(hullResonanceMultiplier(mk(["eliteBonusFlagCruiserAllResistances1"]))).toBe(0.8);
    expect(hullResonanceMultiplier(mk(["shipBonusDreadnoughtG1HullResonance"]))).toBe(0.75);
  });
});
