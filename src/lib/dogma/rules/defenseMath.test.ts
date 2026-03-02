import { describe, expect, it } from "vitest";
import {
  applyHpBonus,
  applyShieldCapacityBonus,
  damageKey,
  estimateEhp,
  inferResistanceBonusLayer,
  normalizeHullResonance,
  readResistsFromResonance,
  shouldApplyPassiveCompensation
} from "./defenseMath";

describe("dogma defenseMath characterization", () => {
  it("normalizes hull resonance defaults to pyfa-compatible baseline", () => {
    expect(normalizeHullResonance(undefined)).toBeCloseTo(0.67, 2);
    expect(normalizeHullResonance(1)).toBeCloseTo(0.67, 2);
    expect(normalizeHullResonance(0.52)).toBeCloseTo(0.52, 6);
  });

  it("applies shield capacity bonus as flat add or multiplier based on effect tags", () => {
    const hp = { shield: 1000, armor: 500, hull: 400 };
    applyShieldCapacityBonus(hp, 250, "shieldcapacitybonusonline");
    expect(hp.shield).toBeCloseTo(1250, 6);

    applyShieldCapacityBonus(hp, 20, "shieldcapacitymultiplypostpercent");
    expect(hp.shield).toBeCloseTo(1500, 6);
  });

  it("applies hp bonuses for additive, percent, and multiplier-style values", () => {
    const hp = { shield: 1000, armor: 500, hull: 400 };
    applyHpBonus(hp, "armor", 300, "armorhpbonusadd");
    expect(hp.armor).toBeCloseTo(800, 6);

    applyHpBonus(hp, "hull", 25, "structurehpbonuspercent");
    expect(hp.hull).toBeCloseTo(500, 6);

    applyHpBonus(hp, "shield", 1.1, "shieldhpbonusmultiply");
    expect(hp.shield).toBeCloseTo(1100, 6);
  });

  it("maps resistance layers and damage tokens deterministically", () => {
    expect(inferResistanceBonusLayer("Shield EM Damage Resistance Bonus", "")).toBe("shield");
    expect(inferResistanceBonusLayer("Armor EM Damage Resistance Bonus", "")).toBe("armor");
    expect(inferResistanceBonusLayer("Structure EM Damage Resistance Bonus", "")).toBe("hull");
    expect(inferResistanceBonusLayer("EM Damage Resistance Bonus", "modifyshieldresonancepostpercent")).toBe("shield");

    expect(damageKey("EM")).toBe("em");
    expect(damageKey("Thermal")).toBe("therm");
    expect(damageKey("Kinetic")).toBe("kin");
    expect(damageKey("Explosive")).toBe("exp");
  });

  it("matches passive compensation gating behavior", () => {
    expect(shouldApplyPassiveCompensation("modifyarmorresonancepostpercent")).toBe(true);
    expect(shouldApplyPassiveCompensation("modifyshieldresonancepostpercent")).toBe(true);
    expect(shouldApplyPassiveCompensation("modifyshieldresonancepostpercent|rigslot")).toBe(false);
    expect(shouldApplyPassiveCompensation("loPower")).toBe(false);
  });

  it("converts resonance to resists and computes EHP with floor behavior", () => {
    const resists = readResistsFromResonance({
      shield: { em: 1, therm: 0.5, kin: 0, exp: -1 },
      armor: { em: undefined, therm: 0.5, kin: 0.5, exp: 0.5 },
      hull: { em: 0.99, therm: 0.99, kin: 0.99, exp: 0.99 }
    });

    expect(resists.shield.em).toBeCloseTo(0, 6);
    expect(resists.shield.therm).toBeCloseTo(0.5, 6);
    expect(resists.shield.kin).toBeCloseTo(0.95, 6);
    expect(resists.shield.exp).toBeCloseTo(0.95, 6);
    expect(resists.armor.em).toBeCloseTo(0.2, 6);
    expect(resists.hull.em).toBeCloseTo(0.01, 6);

    const ehp = estimateEhp(1000, 1000, 1000, {
      shield: { em: 0.95, therm: 0.95, kin: 0.95, exp: 0.95 },
      armor: { em: 0, therm: 0, kin: 0, exp: 0 },
      hull: { em: 0.99, therm: 0.99, kin: 0.99, exp: 0.99 }
    });

    expect(ehp).toBeCloseTo(41000, -2);
  });
});
