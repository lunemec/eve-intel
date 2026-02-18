import { describe, expect, it } from "vitest";
import { calculateShipCombatMetrics } from "./calc";
import { buildDogmaIndex, resolveTypeIdByName } from "./index";
import type { DogmaPack, FitResolvedSlots } from "./types";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEftToResolvedFit } from "./parity/eft";

const basePack: DogmaPack = {
  formatVersion: 1,
  source: "test",
  sdeVersion: "test-v1",
  generatedAt: "2026-02-16T00:00:00Z",
  typeCount: 3,
  types: [
    {
      typeId: 1000,
      groupId: 1,
      categoryId: 1,
      name: "Test Ship",
      attrs: {
        shieldCapacity: 3000,
        armorHP: 2500,
        structureHP: 2200,
        shieldEmDamageResonance: 1,
        shieldThermalDamageResonance: 0.8,
        shieldKineticDamageResonance: 0.6,
        shieldExplosiveDamageResonance: 0.5
      },
      effects: []
    },
    {
      typeId: 2000,
      groupId: 2,
      categoryId: 7,
      name: "200mm Autocannon II",
      attrs: {
        damageMultiplier: 2.2,
        speed: 3000,
        maxRange: 6000,
        falloff: 12000,
        "Used with (Charge Group)": 1
      },
      effects: ["projectileFired"]
    },
    {
      typeId: 2100,
      groupId: 2,
      categoryId: 8,
      name: "EMP S",
      attrs: {
        "EM damage": 6,
        "Thermal damage": 2,
        "Kinetic damage": 2,
        "Explosive damage": 8,
        "Range bonus": 1
      },
      effects: ["ammoInfluenceRange"]
    },
    {
      typeId: 3000,
      groupId: 2,
      categoryId: 7,
      name: "Rapid Light Missile Launcher II",
      attrs: {
        damageMultiplier: 1.8,
        speed: 4200,
        maxRange: 28000,
        "Used with (Charge Group)": 2
      },
      effects: ["missileLaunch"]
    },
    {
      typeId: 3100,
      groupId: 2,
      categoryId: 8,
      name: "Scourge Light Missile",
      attrs: {
        "EM damage": 0,
        "Thermal damage": 0,
        "Kinetic damage": 14,
        "Explosive damage": 0,
        "Maximum Velocity": 3000,
        "Maximum Flight Time": 6000
      },
      effects: ["ammoSpeedMultiplier"]
    }
  ],
  groups: [],
  categories: []
};

const emptySlots: FitResolvedSlots = {
  high: [],
  mid: [],
  low: [],
  rig: [],
  cargo: [],
  other: []
};

describe("dogma calc", () => {
  it("computes offensive and tank metrics for turret fit", () => {
    const index = buildDogmaIndex(basePack);
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [{ typeId: 2000, name: "200mm Autocannon II", chargeTypeId: 2100, chargeName: "EMP S" }]
      }
    });
    expect(metrics.dpsTotal).toBeGreaterThan(0);
    expect(metrics.alpha).toBeGreaterThan(0);
    expect(metrics.engagementRange.effectiveBand).toBeGreaterThan(0);
    expect(metrics.ehp).toBeGreaterThan(0);
    expect(metrics.confidence).toBeGreaterThan(0);
  });

  it("applies loaded command burst charge defensive bonuses to self profile", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7000,
          groupId: 2001,
          categoryId: 7,
          name: "Shield Command Burst II",
          attrs: {},
          effects: ["hiPower"]
        },
        {
          typeId: 7100,
          groupId: 2002,
          categoryId: 8,
          name: "Shield Harmonizing Charge",
          attrs: {},
          attrsById: {
            2468: 10
          },
          effects: []
        },
        {
          typeId: 7101,
          groupId: 2002,
          categoryId: 8,
          name: "Shield Extension Charge",
          attrs: {},
          attrsById: {
            2468: 12
          },
          effects: []
        }
      ],
      typeCount: basePack.typeCount + 3
    };
    const index = buildDogmaIndex(pack);
    const base = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: { ...emptySlots }
    });
    const boosted = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 7000, name: "Shield Command Burst II", chargeTypeId: 7100, chargeName: "Shield Harmonizing Charge" },
          { typeId: 7000, name: "Shield Command Burst II", chargeTypeId: 7101, chargeName: "Shield Extension Charge" }
        ]
      }
    });
    expect(boosted.ehp).toBeGreaterThan(base.ehp * 1.08);
    expect(boosted.resists.shield.em).toBeGreaterThan(base.resists.shield.em);
  });

  it("computes missile range when launcher is fitted", () => {
    const index = buildDogmaIndex(basePack);
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          {
            typeId: 3000,
            name: "Rapid Light Missile Launcher II",
            chargeTypeId: 3100,
            chargeName: "Scourge Light Missile"
          }
        ]
      }
    });
    expect(metrics.engagementRange.missileMax).toBeGreaterThan(0);
    expect(metrics.engagementRange.effectiveBand).toBeGreaterThan(0);
  });

  it("does not apply turret specialization alpha multipliers to missiles", () => {
    const index = buildDogmaIndex(basePack);
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          {
            typeId: 3000,
            name: "Rapid Light Missile Launcher II",
            chargeTypeId: 3100,
            chargeName: "Scourge Light Missile"
          }
        ]
      }
    });
    // 14 kinetic damage * missile all-V damage skills (1.375)
    expect(metrics.alpha).toBeCloseTo(19.3, 1);
  });

  it("applies typed missile hull damage effects based on loaded charge damage type", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 1100,
          groupId: 1,
          categoryId: 1,
          name: "Typed Missile Ship",
          attrs: {
            shieldCapacity: 3000,
            armorHP: 2500,
            structureHP: 2200
          },
          attrsById: {
            487: 20
          },
          effects: ["shipMissileEMDamageCC"]
        },
        {
          typeId: 3101,
          groupId: 2,
          categoryId: 8,
          name: "Mjolnir Light Missile",
          attrs: {
            "EM damage": 14,
            "Thermal damage": 0,
            "Kinetic damage": 0,
            "Explosive damage": 0,
            "Maximum Velocity": 3000,
            "Maximum Flight Time": 6000
          },
          effects: ["ammoSpeedMultiplier"]
        }
      ],
      typeCount: basePack.typeCount + 2
    };
    const index = buildDogmaIndex(pack);
    const kinetic = calculateShipCombatMetrics(index, {
      shipTypeId: 1100,
      slots: {
        ...emptySlots,
        high: [{ typeId: 3000, name: "Rapid Light Missile Launcher II", chargeTypeId: 3100, chargeName: "Scourge Light Missile" }]
      }
    });
    const em = calculateShipCombatMetrics(index, {
      shipTypeId: 1100,
      slots: {
        ...emptySlots,
        high: [{ typeId: 3000, name: "Rapid Light Missile Launcher II", chargeTypeId: 3101, chargeName: "Mjolnir Light Missile" }]
      }
    });
    expect(em.dpsTotal).toBeGreaterThan(kinetic.dpsTotal * 1.9);
  });

  it("applies mixed weapon damage mods only to their matching weapon families", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 6000,
          groupId: 59,
          categoryId: 7,
          name: "Gyrostabilizer II",
          attrs: {
            "Damage Modifier": 1.1,
            "Rate of Fire Bonus": 0.9
          },
          effects: ["loPower", "projectileWeaponSpeedMultiply", "projectileWeaponDamageMultiply"]
        },
        {
          typeId: 6001,
          groupId: 367,
          categoryId: 7,
          name: "Ballistic Control System II",
          attrs: {
            "Missile Damage Bonus": 1.1,
            "Rate of Fire Bonus": 0.9
          },
          effects: ["loPower", "missileDMGBonus", "missileLauncherSpeedMultiplier"]
        }
      ],
      typeCount: basePack.types.length + 2
    };
    const index = buildDogmaIndex(pack);
    const base = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 2000, name: "200mm Autocannon II", chargeTypeId: 2100, chargeName: "EMP S" },
          { typeId: 3000, name: "Rapid Light Missile Launcher II", chargeTypeId: 3100, chargeName: "Scourge Light Missile" }
        ]
      }
    });
    const gyroOnly = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 2000, name: "200mm Autocannon II", chargeTypeId: 2100, chargeName: "EMP S" },
          { typeId: 3000, name: "Rapid Light Missile Launcher II", chargeTypeId: 3100, chargeName: "Scourge Light Missile" }
        ],
        low: [{ typeId: 6000, name: "Gyrostabilizer II" }]
      }
    });
    const bcsOnly = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 2000, name: "200mm Autocannon II", chargeTypeId: 2100, chargeName: "EMP S" },
          { typeId: 3000, name: "Rapid Light Missile Launcher II", chargeTypeId: 3100, chargeName: "Scourge Light Missile" }
        ],
        low: [{ typeId: 6001, name: "Ballistic Control System II" }]
      }
    });
    const both = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 2000, name: "200mm Autocannon II", chargeTypeId: 2100, chargeName: "EMP S" },
          { typeId: 3000, name: "Rapid Light Missile Launcher II", chargeTypeId: 3100, chargeName: "Scourge Light Missile" }
        ],
        low: [
          { typeId: 6000, name: "Gyrostabilizer II" },
          { typeId: 6001, name: "Ballistic Control System II" }
        ]
      }
    });

    expect(gyroOnly.alpha).toBeGreaterThan(base.alpha);
    expect(bcsOnly.alpha).toBeGreaterThan(base.alpha);
    expect(gyroOnly.alpha).toBeGreaterThan(bcsOnly.alpha);
    expect(gyroOnly.alpha).toBeLessThan(base.alpha * 1.1);
    expect(bcsOnly.alpha).toBeLessThan(base.alpha * 1.1);
    expect(both.alpha).toBeGreaterThan(gyroOnly.alpha);
    expect(both.alpha).toBeGreaterThan(bcsOnly.alpha);
    expect(both.dpsTotal).toBeGreaterThan(gyroOnly.dpsTotal);
    expect(both.dpsTotal).toBeGreaterThan(bcsOnly.dpsTotal);
  });

  it("treats particle accelerator turrets as weapon modules", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 4000,
          groupId: 2,
          categoryId: 7,
          name: "Modal Light Neutron Particle Accelerator I",
          attrs: {
            damageMultiplier: 2.1,
            speed: 3200,
            maxRange: 2800,
            falloff: 6000
          },
          effects: ["projectileFired"]
        },
        {
          typeId: 4100,
          groupId: 2,
          categoryId: 8,
          name: "Caldari Navy Antimatter Charge S",
          attrs: {
            "EM damage": 0,
            "Thermal damage": 8,
            "Kinetic damage": 8,
            "Explosive damage": 0
          },
          effects: ["ammoInfluenceRange"]
        }
      ],
      typeCount: basePack.types.length + 2
    };
    const index = buildDogmaIndex(pack);
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          {
            typeId: 4000,
            name: "Modal Light Neutron Particle Accelerator I",
            chargeTypeId: 4100,
            chargeName: "Caldari Navy Antimatter Charge S"
          }
        ]
      }
    });
    expect(metrics.dpsTotal).toBeGreaterThan(0);
    expect(metrics.alpha).toBeGreaterThan(0);
  });

  it("falls back to conservative defaults when ship dogma is missing", () => {
    const index = buildDogmaIndex(basePack);
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 999999,
      slots: emptySlots
    });
    expect(metrics.confidence).toBeGreaterThan(0);
    expect(metrics.ehp).toBeGreaterThan(0);
    expect(metrics.assumptions[0]).toMatch(/conservative hull defaults/i);
  });

  it("tracks Eris pyfa-style benchmark envelope using compiled dogma pack", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 22460,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 22782, name: "Interdiction Sphere Launcher I", chargeTypeId: 22778, chargeName: "Warp Disrupt Probe" },
          { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId: 12612, chargeName: "Void S" },
          { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId: 12612, chargeName: "Void S" },
          { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId: 12612, chargeName: "Void S" },
          { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId: 12612, chargeName: "Void S" },
          { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId: 12612, chargeName: "Void S" },
          { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId: 12612, chargeName: "Void S" },
          { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId: 12612, chargeName: "Void S" }
        ],
        mid: [
          { typeId: 5973, name: "5MN Y-T8 Compact Microwarpdrive" },
          { typeId: 14256, name: "Dread Guristas Warp Scrambler" }
        ],
        low: [
          { typeId: 5839, name: "IFFA Compact Damage Control" },
          { typeId: 10190, name: "Magnetic Field Stabilizer II" },
          { typeId: 2605, name: "Nanofiber Internal Structure II" },
          { typeId: 11105, name: "Vortex Compact Magnetic Field Stabilizer" }
        ],
        rig: [
          { typeId: 33892, name: "Small Transverse Bulkhead II" },
          { typeId: 33892, name: "Small Transverse Bulkhead II" }
        ]
      }
    });

    expect(metrics.dpsTotal).toBeGreaterThan(650);
    expect(metrics.dpsTotal).toBeLessThan(900);
    expect(metrics.alpha).toBeGreaterThan(900);
    expect(metrics.alpha).toBeLessThan(1200);
    expect(metrics.speed.base).toBeGreaterThan(410);
    expect(metrics.speed.base).toBeLessThan(460);
    expect(metrics.speed.propOn).toBeGreaterThan(2900);
    expect(metrics.speed.propOn).toBeLessThan(3500);
    expect(metrics.speed.propOnHeated).toBeGreaterThan(4200);
    expect(metrics.speed.propOnHeated).toBeLessThan(5000);
    expect(metrics.signature.base).toBeGreaterThan(70);
    expect(metrics.signature.base).toBeLessThan(90);
    expect(metrics.signature.propOn).toBeGreaterThan(250);
    expect(metrics.signature.propOn).toBeLessThan(290);
    expect(metrics.ehp).toBeGreaterThan(5500);
    expect(metrics.ehp).toBeLessThan(9000);
  });

  it("does not clamp assault damage control hull resonance below module value", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 5000,
          groupId: 1,
          categoryId: 1,
          name: "ADC Test Ship",
          attrs: {
            "Structure EM Damage Resistance": 0.67,
            "Structure Thermal Damage Resistance": 0.67,
            "Structure Kinetic Damage Resistance": 0.67,
            "Structure Explosive Damage Resistance": 0.67
          },
          effects: []
        },
        {
          typeId: 5001,
          groupId: 60,
          categoryId: 7,
          name: "Assault Damage Control II",
          attrs: {
            "Structure EM Damage Resistance": 0.7,
            "Structure Thermal Damage Resistance": 0.7,
            "Structure Kinetic Damage Resistance": 0.7,
            "Structure Explosive Damage Resistance": 0.7
          },
          effects: ["moduleBonusAssaultDamageControl"]
        }
      ],
      typeCount: basePack.types.length + 2
    };
    const index = buildDogmaIndex(pack);
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 5000,
      slots: {
        ...emptySlots,
        low: [{ typeId: 5001, name: "Assault Damage Control II" }]
      }
    });
    expect(metrics.resists.hull.em).toBeCloseTo(0.531, 3);
    expect(metrics.resists.hull.therm).toBeCloseTo(0.531, 3);
    expect(metrics.resists.hull.kin).toBeCloseTo(0.531, 3);
    expect(metrics.resists.hull.exp).toBeCloseTo(0.531, 3);
  });

  it("normalizes structure resonance value 1 to pyfa baseline", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 5002,
          groupId: 1,
          categoryId: 1,
          name: "Structure One Ship",
          attrs: {
            "Structure EM Damage Resistance": 1,
            "Structure Thermal Damage Resistance": 1,
            "Structure Kinetic Damage Resistance": 1,
            "Structure Explosive Damage Resistance": 1
          },
          effects: []
        }
      ],
      typeCount: basePack.types.length + 2
    };
    const index = buildDogmaIndex(pack);
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 5002,
      slots: emptySlots
    });
    expect(metrics.resists.hull.em).toBeCloseTo(0.33, 2);
    expect(metrics.resists.hull.therm).toBeCloseTo(0.33, 2);
    expect(metrics.resists.hull.kin).toBeCloseTo(0.33, 2);
    expect(metrics.resists.hull.exp).toBeCloseTo(0.33, 2);
  });

  it("applies battleship plate role bonus to armor plate HP", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7000,
          groupId: 1,
          categoryId: 1,
          name: "Roleless Battleship",
          attrs: {
            shieldCapacity: 3000,
            armorHP: 5000,
            structureHP: 3500
          },
          effects: []
        },
        {
          typeId: 7001,
          groupId: 1,
          categoryId: 1,
          name: "Role Bonus Battleship",
          attrs: {
            shieldCapacity: 3000,
            armorHP: 5000,
            structureHP: 3500
          },
          effects: ["BattleshipRoleBonusArmorPlate&ShieldExtenderHP"]
        },
        {
          typeId: 7002,
          groupId: 329,
          categoryId: 7,
          name: "1600mm Steel Plates II",
          attrs: {
            "Armor Hitpoint Bonus": 4200
          },
          effects: ["armorHPBonusAdd", "armorReinforcerMassAdd"]
        }
      ],
      typeCount: basePack.types.length + 3
    };
    const index = buildDogmaIndex(pack);
    const slots = {
      ...emptySlots,
      low: [{ typeId: 7002, name: "1600mm Steel Plates II" }]
    };
    const withoutRole = calculateShipCombatMetrics(index, {
      shipTypeId: 7000,
      slots
    });
    const withRole = calculateShipCombatMetrics(index, {
      shipTypeId: 7001,
      slots
    });

    expect(withRole.ehp).toBeGreaterThan(withoutRole.ehp * 1.06);
  });

  it("redistributes reactive armor hardener resist profile toward weak armor damage types", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7100,
          groupId: 1,
          categoryId: 1,
          name: "Reactive Test Ship",
          attrs: {
            "Armor EM Damage Resistance": 0.5,
            "Armor Thermal Damage Resistance": 0.65,
            "Armor Kinetic Damage Resistance": 0.75,
            "Armor Explosive Damage Resistance": 0.9
          },
          effects: []
        },
        {
          typeId: 7101,
          groupId: 326,
          categoryId: 7,
          name: "Multispectrum Energized Membrane II",
          attrs: {
            "EM Damage Resistance Bonus": -20,
            "Thermal Damage Resistance Bonus": -20,
            "Kinetic Damage Resistance Bonus": -20,
            "Explosive Damage Resistance Bonus": -20
          },
          effects: ["modifyArmorResonancePostPercent", "loPower"]
        },
        {
          typeId: 7102,
          groupId: 1150,
          categoryId: 7,
          name: "Reactive Armor Hardener",
          attrs: {
            "Armor EM Damage Resistance": 0.85,
            "Armor Thermal Damage Resistance": 0.85,
            "Armor Kinetic Damage Resistance": 0.85,
            "Armor Explosive Damage Resistance": 0.85
          },
          effects: ["adaptiveArmorHardener", "loPower"]
        }
      ],
      typeCount: basePack.types.length + 3
    };
    const index = buildDogmaIndex(pack);
    const membraneOnly = calculateShipCombatMetrics(index, {
      shipTypeId: 7100,
      slots: {
        ...emptySlots,
        low: [{ typeId: 7101, name: "Multispectrum Energized Membrane II" }]
      }
    });
    const withReactive = calculateShipCombatMetrics(index, {
      shipTypeId: 7100,
      slots: {
        ...emptySlots,
        low: [
          { typeId: 7101, name: "Multispectrum Energized Membrane II" },
          { typeId: 7102, name: "Reactive Armor Hardener" }
        ]
      }
    });

    expect(withReactive.resists.armor.em).toBeLessThanOrEqual(membraneOnly.resists.armor.em + 0.02);
    expect(withReactive.resists.armor.exp).toBeGreaterThan(membraneOnly.resists.armor.exp + 0.18);
  });

  it("applies marauder shield bonus as EM-only shield resist", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7200,
          groupId: 1,
          categoryId: 1,
          name: "Marauder Shield Bonus Test Ship",
          attrs: {
            "Shield EM Damage Resistance": 1,
            "Shield Thermal Damage Resistance": 1,
            "Shield Kinetic Damage Resistance": 1,
            "Shield Explosive Damage Resistance": 1
          },
          effects: ["eliteBonusMarauderShieldBonus2a"]
        }
      ],
      typeCount: basePack.types.length + 1
    };
    const index = buildDogmaIndex(pack);
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 7200,
      slots: emptySlots
    });

    expect(metrics.resists.shield.em).toBeGreaterThan(0.1);
    expect(metrics.resists.shield.therm).toBeLessThan(0.01);
    expect(metrics.resists.shield.kin).toBeLessThan(0.01);
    expect(metrics.resists.shield.exp).toBeLessThan(0.01);
  });

  it("applies subsystem effects carried in other slots to hull weapon bonuses", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7300,
          groupId: 963,
          categoryId: 6,
          name: "Subsystem Missile Ship",
          attrs: {
            shieldCapacity: 2500,
            armorHP: 2200,
            structureHP: 2000
          },
          effects: []
        },
        {
          typeId: 7301,
          groupId: 954,
          categoryId: 32,
          name: "Missile Offensive Subsystem",
          attrs: {},
          effects: ["subsystemBonusCaldariOffensive1LauncherROF", "subsystemBonusCaldariOffensive2MissileDamage"]
        }
      ],
      typeCount: basePack.types.length + 2
    };
    const index = buildDogmaIndex(pack);
    const base = calculateShipCombatMetrics(index, {
      shipTypeId: 7300,
      slots: {
        ...emptySlots,
        high: [
          {
            typeId: 3000,
            name: "Rapid Light Missile Launcher II",
            chargeTypeId: 3100,
            chargeName: "Scourge Light Missile"
          }
        ]
      }
    });
    const withSubsystem = calculateShipCombatMetrics(index, {
      shipTypeId: 7300,
      slots: {
        ...emptySlots,
        high: [
          {
            typeId: 3000,
            name: "Rapid Light Missile Launcher II",
            chargeTypeId: 3100,
            chargeName: "Scourge Light Missile"
          }
        ],
        other: [{ typeId: 7301, name: "Missile Offensive Subsystem" }]
      }
    });

    expect(withSubsystem.dpsTotal).toBeGreaterThan(base.dpsTotal * 1.35);
    expect(withSubsystem.alpha).toBeGreaterThan(base.alpha * 1.2);
  });

  it("applies bastion offensive ROF bonus to turret weapons", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7500,
          groupId: 515,
          categoryId: 7,
          name: "Bastion Module I",
          attrs: {},
          effects: ["moduleBonusBastionModule"]
        }
      ],
      typeCount: basePack.types.length + 1
    };
    const index = buildDogmaIndex(pack);
    const base = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [{ typeId: 2000, name: "200mm Autocannon II", chargeTypeId: 2100, chargeName: "EMP S" }]
      }
    });
    const bastion = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 2000, name: "200mm Autocannon II", chargeTypeId: 2100, chargeName: "EMP S" },
          { typeId: 7500, name: "Bastion Module I" }
        ]
      }
    });

    expect(bastion.dpsTotal).toBeGreaterThan(base.dpsTotal * 1.8);
    expect(bastion.alpha).toBeCloseTo(base.alpha, 1);
  });

  it("applies bastion offensive ROF bonus to missile weapons only when charge is loaded", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7501,
          groupId: 515,
          categoryId: 7,
          name: "Bastion Module I",
          attrs: {},
          effects: ["moduleBonusBastionModule"]
        }
      ],
      typeCount: basePack.types.length + 1
    };
    const index = buildDogmaIndex(pack);
    const loaded = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 3000, name: "Rapid Light Missile Launcher II", chargeTypeId: 3100, chargeName: "Scourge Light Missile" },
          { typeId: 7501, name: "Bastion Module I" }
        ]
      }
    });
    const unloaded = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 3000, name: "Rapid Light Missile Launcher II" },
          { typeId: 7501, name: "Bastion Module I" }
        ]
      }
    });

    expect(loaded.dpsTotal).toBeGreaterThan(unloaded.dpsTotal * 1.8);
  });

  it("applies cruise/torpedo role damage uplift only when missile charge is loaded", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7600,
          groupId: 963,
          categoryId: 6,
          name: "Cruise Torp Role Ship",
          attrs: {
            shieldCapacity: 2500,
            armorHP: 2200,
            structureHP: 2000
          },
          effects: ["eliteBonusMaraudersCruiseAndTorpedoDamageRole1"]
        },
        {
          typeId: 7601,
          groupId: 508,
          categoryId: 7,
          name: "Torpedo Launcher II",
          attrs: {
            damageMultiplier: 1.8,
            speed: 4000
          },
          effects: ["useMissiles", "launcherFitted", "hiPower"]
        },
        {
          typeId: 7602,
          groupId: 510,
          categoryId: 8,
          name: "Inferno Torpedo",
          attrs: {
            "EM damage": 0,
            "Thermal damage": 40,
            "Kinetic damage": 0,
            "Explosive damage": 40
          },
          effects: ["ammoInfluenceRange"]
        }
      ],
      typeCount: basePack.types.length + 3
    };
    const index = buildDogmaIndex(pack);
    const loaded = calculateShipCombatMetrics(index, {
      shipTypeId: 7600,
      slots: {
        ...emptySlots,
        high: [{ typeId: 7601, name: "Torpedo Launcher II", chargeTypeId: 7602, chargeName: "Inferno Torpedo" }]
      }
    });
    const unloaded = calculateShipCombatMetrics(index, {
      shipTypeId: 7600,
      slots: {
        ...emptySlots,
        high: [{ typeId: 7601, name: "Torpedo Launcher II" }]
      }
    });

    expect(loaded.alpha).toBeGreaterThan(unloaded.alpha * 1.5);
  });

  it("applies Loki projectile subsystem uplift for offensive profile", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7400,
          groupId: 963,
          categoryId: 6,
          name: "Loki Profile Test Ship",
          attrs: {
            shieldCapacity: 2500,
            armorHP: 2200,
            structureHP: 2000
          },
          effects: ["subsystemBonusMinmatarOffensive2ProjectileWeaponDamageMultiplier"]
        }
      ],
      typeCount: basePack.types.length + 1
    };
    const index = buildDogmaIndex(pack);
    const base = calculateShipCombatMetrics(index, {
      shipTypeId: 1000,
      slots: {
        ...emptySlots,
        high: [{ typeId: 2000, name: "200mm Autocannon II", chargeTypeId: 2100, chargeName: "EMP S" }]
      }
    });
    const loki = calculateShipCombatMetrics(index, {
      shipTypeId: 7400,
      slots: {
        ...emptySlots,
        high: [{ typeId: 2000, name: "200mm Autocannon II", chargeTypeId: 2100, chargeName: "EMP S" }]
      }
    });

    expect(loki.alpha).toBeGreaterThan(base.alpha * 1.2);
  });

  it("applies gallente defensive subsystem HP uplift", () => {
    const pack: DogmaPack = {
      ...basePack,
      types: [
        ...basePack.types,
        {
          typeId: 7402,
          groupId: 963,
          categoryId: 6,
          name: "Proteus Control Test Ship",
          attrs: {
            shieldCapacity: 2500,
            armorHP: 2200,
            structureHP: 2000
          },
          effects: []
        },
        {
          typeId: 29988,
          groupId: 963,
          categoryId: 6,
          name: "Proteus Defensive Test Ship",
          attrs: {
            shieldCapacity: 2500,
            armorHP: 2200,
            structureHP: 2000
          },
          effects: []
        }
      ],
      typeCount: basePack.types.length + 1
    };
    const index = buildDogmaIndex(pack);
    const base = calculateShipCombatMetrics(index, {
      shipTypeId: 7402,
      slots: emptySlots
    });
    const proteus = calculateShipCombatMetrics(index, {
      shipTypeId: 29988,
      slots: emptySlots
    });

    expect(proteus.ehp).toBeGreaterThan(base.ehp + 1200);
  });

  it("keeps Sabre shield-extender EHP in sane envelope for sectioned EFT input", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);
    const eft = `[Sabre, Inferred 100%]

High Slots:
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
Interdiction Sphere Launcher I,Warp Disrupt Probe

Mid Slots:
5MN Y-T8 Compact Microwarpdrive
Faint Epsilon Scoped Warp Scrambler
Fleeting Compact Stasis Webifier
Medium Shield Extender II

Low Slots:
Gyrostabilizer II
Nanofiber Internal Structure II

Rig Slots:
Small Core Defense Field Extender I
Small Core Defense Field Extender I`;

    const parsed = parseEftToResolvedFit(index, eft);
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: parsed.shipTypeId,
      slots: parsed.slots,
      drones: parsed.drones
    });

    expect(metrics.ehp).toBeGreaterThan(7000);
    expect(metrics.ehp).toBeLessThan(14000);
  });

  it("applies ammo and turret range modifiers for Eris blasters (Void/AM/Null)", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const buildSlots = (chargeTypeId: number, chargeName: string): FitResolvedSlots => ({
      ...emptySlots,
      high: [
        { typeId: 22782, name: "Interdiction Sphere Launcher I", chargeTypeId: 22778, chargeName: "Warp Disrupt Probe" },
        { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId, chargeName },
        { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId, chargeName },
        { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId, chargeName },
        { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId, chargeName },
        { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId, chargeName },
        { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId, chargeName },
        { typeId: 3178, name: "Light Neutron Blaster II", chargeTypeId, chargeName }
      ],
      mid: [
        { typeId: 5973, name: "5MN Y-T8 Compact Microwarpdrive" },
        { typeId: 14256, name: "Dread Guristas Warp Scrambler" }
      ],
      low: [
        { typeId: 5839, name: "IFFA Compact Damage Control" },
        { typeId: 10190, name: "Magnetic Field Stabilizer II" },
        { typeId: 2605, name: "Nanofiber Internal Structure II" },
        { typeId: 11105, name: "Vortex Compact Magnetic Field Stabilizer" }
      ],
      rig: [
        { typeId: 33892, name: "Small Transverse Bulkhead II" },
        { typeId: 33892, name: "Small Transverse Bulkhead II" }
      ]
    });

    const voidMetrics = calculateShipCombatMetrics(index, { shipTypeId: 22460, slots: buildSlots(12612, "Void S") });
    const antiMetrics = calculateShipCombatMetrics(index, { shipTypeId: 22460, slots: buildSlots(222, "Antimatter Charge S") });
    const nullMetrics = calculateShipCombatMetrics(index, { shipTypeId: 22460, slots: buildSlots(12614, "Null S") });

    expect(voidMetrics.engagementRange.effectiveBand).toBeGreaterThan(2500);
    expect(voidMetrics.engagementRange.effectiveBand).toBeLessThan(3600);
    expect(antiMetrics.engagementRange.effectiveBand).toBeGreaterThan(3300);
    expect(antiMetrics.engagementRange.effectiveBand).toBeLessThan(5000);
    expect(nullMetrics.engagementRange.effectiveBand).toBeGreaterThan(5800);
    expect(nullMetrics.engagementRange.effectiveBand).toBeLessThan(8000);

    expect(voidMetrics.engagementRange.effectiveBand).toBeLessThan(antiMetrics.engagementRange.effectiveBand);
    expect(antiMetrics.engagementRange.effectiveBand).toBeLessThan(nullMetrics.engagementRange.effectiveBand);
    expect(voidMetrics.engagementRange.optimal).toBeLessThan(5000);
  });

  it("keeps DST armor fits in a realistic EHP envelope (Impel tank)", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 12753,
      slots: {
        ...emptySlots,
        low: [
          { typeId: 2048, name: "Damage Control II" },
          { typeId: 11269, name: "Multispectrum Energized Membrane II" },
          { typeId: 11269, name: "Multispectrum Energized Membrane II" },
          { typeId: 20353, name: "1600mm Steel Plates II" },
          { typeId: 20353, name: "1600mm Steel Plates II" },
          { typeId: 20353, name: "1600mm Steel Plates II" }
        ],
        rig: [
          { typeId: 31059, name: "Medium Trimark Armor Pump II" },
          { typeId: 31059, name: "Medium Trimark Armor Pump II" }
        ]
      }
    });

    expect(metrics.ehp).toBeGreaterThan(90000);
    expect(metrics.ehp).toBeLessThan(220000);
    expect(metrics.resists.armor.em).toBeGreaterThan(0.7);
    expect(metrics.resists.armor.exp).toBeGreaterThan(0.7);
  });

  it("keeps Heretic armor dictor fit in realistic EHP envelope", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 22452,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 22782, name: "Interdiction Sphere Launcher I", chargeTypeId: 22778, chargeName: "Warp Disrupt Probe" },
          { typeId: 10631, name: "Rocket Launcher II", chargeTypeId: 24473, chargeName: "Nova Rage Rocket" },
          { typeId: 10631, name: "Rocket Launcher II", chargeTypeId: 24473, chargeName: "Nova Rage Rocket" },
          { typeId: 10631, name: "Rocket Launcher II", chargeTypeId: 24473, chargeName: "Nova Rage Rocket" },
          { typeId: 10631, name: "Rocket Launcher II", chargeTypeId: 24473, chargeName: "Nova Rage Rocket" },
          { typeId: 10631, name: "Rocket Launcher II", chargeTypeId: 24473, chargeName: "Nova Rage Rocket" }
        ],
        mid: [
          { typeId: 5977, name: "5MN Quad LiF Restrained Microwarpdrive" },
          { typeId: 14222, name: "Faint Epsilon Scoped Warp Scrambler" },
          { typeId: 527, name: "X5 Enduring Stasis Webifier" }
        ],
        low: [
          { typeId: 11311, name: "400mm Crystalline Carbonide Restrained Plates" },
          { typeId: 2048, name: "Damage Control II" },
          { typeId: 14001, name: "True Sansha Multispectrum Coating" }
        ],
        rig: [
          { typeId: 31057, name: "Small Trimark Armor Pump II" },
          { typeId: 31057, name: "Small Trimark Armor Pump II" }
        ]
      }
    });

    expect(metrics.ehp).toBeGreaterThan(20000);
    expect(metrics.ehp).toBeLessThan(35000);
  });

  it("keeps Gila drone fit in realistic DPS/EHP envelope", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 17715,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 8027, name: "Prototype 'Arbalest' Rapid Light Missile Launcher", chargeTypeId: 1810, chargeName: "Scourge Auto-Targeting Light Missile I" },
          { typeId: 8027, name: "Prototype 'Arbalest' Rapid Light Missile Launcher", chargeTypeId: 1810, chargeName: "Scourge Auto-Targeting Light Missile I" },
          { typeId: 8027, name: "Prototype 'Arbalest' Rapid Light Missile Launcher", chargeTypeId: 1810, chargeName: "Scourge Auto-Targeting Light Missile I" },
          { typeId: 8027, name: "Prototype 'Arbalest' Rapid Light Missile Launcher", chargeTypeId: 1810, chargeName: "Scourge Auto-Targeting Light Missile I" },
          { typeId: 23527, name: "Drone Link Augmentor I" }
        ],
        mid: [
          { typeId: 35656, name: "10MN Y-S8 Compact Afterburner" },
          { typeId: 19187, name: "Pithum C-Type Medium Shield Booster" },
          { typeId: 19187, name: "Pithum C-Type Medium Shield Booster" },
          { typeId: 2281, name: "Multispectrum Shield Hardener II" },
          { typeId: 2281, name: "Multispectrum Shield Hardener II" },
          { typeId: 41220, name: "Thukker Large Cap Battery" },
          { typeId: 14045, name: "Domination Shield Boost Amplifier" }
        ],
        low: [
          { typeId: 2048, name: "Damage Control II" },
          { typeId: 4405, name: "Drone Damage Amplifier II" },
          { typeId: 4405, name: "Drone Damage Amplifier II" }
        ],
        rig: [
          { typeId: 31378, name: "Medium Capacitor Control Circuit II" },
          { typeId: 31378, name: "Medium Capacitor Control Circuit II" },
          { typeId: 31718, name: "Medium EM Shield Reinforcer I" }
        ]
      },
      drones: [{ typeId: 31874, name: "Caldari Navy Vespa", quantity: 4 }]
    });

    expect(metrics.dpsTotal).toBeGreaterThan(700);
    expect(metrics.dpsTotal).toBeLessThan(1300);
    expect(metrics.ehp).toBeGreaterThan(18000);
    expect(metrics.ehp).toBeLessThan(40000);
  });

  it("applies hull afterburner speed-factor bonuses", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const succubus = calculateShipCombatMetrics(index, {
      shipTypeId: 17924,
      slots: {
        ...emptySlots,
        mid: [{ typeId: 438, name: "1MN Afterburner II" }]
      }
    });
    const atron = calculateShipCombatMetrics(index, {
      shipTypeId: 608,
      slots: {
        ...emptySlots,
        mid: [{ typeId: 438, name: "1MN Afterburner II" }]
      }
    });

    const succubusRatio = succubus.speed.propOn / Math.max(1, succubus.speed.base);
    const atronRatio = atron.speed.propOn / Math.max(1, atron.speed.base);
    expect(succubusRatio).toBeGreaterThan(4);
    expect(succubusRatio).toBeGreaterThan(atronRatio * 1.4);
  });

  it("applies MWD signature bloom mitigation from hull bonuses", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const wolf = calculateShipCombatMetrics(index, {
      shipTypeId: 11371,
      slots: {
        ...emptySlots,
        mid: [{ typeId: 5973, name: "5MN Y-T8 Compact Microwarpdrive" }]
      }
    });
    const crow = calculateShipCombatMetrics(index, {
      shipTypeId: 11176,
      slots: {
        ...emptySlots,
        mid: [{ typeId: 5973, name: "5MN Y-T8 Compact Microwarpdrive" }]
      }
    });

    expect(wolf.signature.propOn).toBeLessThan(wolf.signature.base * 4);
    expect(crow.signature.propOn).toBeLessThan(crow.signature.base * 2.5);
  });

  it("tracks svcfitstat Nergal callback envelope for dps/ehp/resists", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const requireAnyTypeId = (...names: string[]): number => {
      for (const name of names) {
        const typeId = resolveTypeIdByName(index, name);
        if (typeId !== undefined) {
          return typeId;
        }
      }
      expect(names[0], `missing dogma types: ${names.join(" | ")}`).toBe("__found__");
      return 0;
    };

    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: requireAnyTypeId("Nergal"),
      slots: {
        ...emptySlots,
        high: [
          {
            typeId: requireAnyTypeId("Light Entropic Disintegrator I"),
            name: "Light Entropic Disintegrator I",
            chargeTypeId: requireAnyTypeId("Tetryon Exotic Plasma S"),
            chargeName: "Tetryon Exotic Plasma S"
          }
        ],
        mid: [
          { typeId: requireAnyTypeId("Small Hull Repairer II"), name: "Small Hull Repairer II" },
          { typeId: requireAnyTypeId("Small Shield Booster I"), name: "Small Shield Booster I" },
          { typeId: requireAnyTypeId("Small Compact Pb-Acid Cap Battery"), name: "Small Compact Pb-Acid Cap Battery" }
        ],
        low: [
          { typeId: requireAnyTypeId("Small Armor Repairer II"), name: "Small Armor Repairer II" },
          { typeId: requireAnyTypeId("Assault Damage Control II"), name: "Assault Damage Control II" },
          {
            typeId: requireAnyTypeId("Adaptive Nano Plating II", "Limited Adaptive Nano Plating I"),
            name: "Adaptive Nano Plating II"
          },
          {
            typeId: requireAnyTypeId("Adaptive Nano Plating II", "Limited Adaptive Nano Plating I"),
            name: "Adaptive Nano Plating II"
          }
        ],
        rig: [
          {
            typeId: requireAnyTypeId("Small Anti-Kinetic Pump I", "Small Kinetic Armor Reinforcer I"),
            name: "Small Anti-Kinetic Pump I"
          },
          {
            typeId: requireAnyTypeId("Small Anti-Kinetic Pump I", "Small Kinetic Armor Reinforcer I"),
            name: "Small Anti-Kinetic Pump I"
          }
        ]
      },
      drones: [{ typeId: requireAnyTypeId("Hobgoblin II"), name: "Hobgoblin II", quantity: 5 }]
    });

    // Direct pyfa all-V baseline for this hull-tank setup keeps low applied DPS but high armor profile.
    expect(metrics.dpsTotal).toBeGreaterThan(120);
    expect(metrics.dpsTotal).toBeLessThan(220);
    expect(metrics.ehp).toBeGreaterThan(7000);
    expect(metrics.ehp).toBeLessThan(13000);
    expect(metrics.resists.armor.em).toBeGreaterThan(0.6);
    expect(metrics.resists.armor.therm).toBeGreaterThan(0.75);
    expect(metrics.resists.armor.kin).toBeGreaterThan(0.65);
    expect(metrics.resists.armor.exp).toBeGreaterThan(0.7);
  });

  it("matches pyfa envelope for Gnosis drone bay split entries (5x Hammerhead II)", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const requireTypeId = (name: string): number => {
      const typeId = resolveTypeIdByName(index, name);
      expect(typeId, `missing dogma type for ${name}`).toBeDefined();
      return typeId!;
    };

    // Source fit has drone bay entries: Hammerhead II x2, Hammerhead II x3, Hornet EC-300 x4.
    // With 50 bandwidth on Gnosis we expect 5x Hammerhead II to be counted for applied drone DPS.
    // Current direct-pyfa all-V baseline for this drone-only setup is ~360 DPS / ~1450 alpha.
    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: requireTypeId("Gnosis"),
      slots: emptySlots,
      drones: [
        { typeId: requireTypeId("Hammerhead II"), name: "Hammerhead II", quantity: 2 },
        { typeId: requireTypeId("Hammerhead II"), name: "Hammerhead II", quantity: 3 },
        { typeId: requireTypeId("Hornet EC-300"), name: "Hornet EC-300", quantity: 4 }
      ]
    });

    expect(metrics.dpsTotal).toBeGreaterThan(320);
    expect(metrics.dpsTotal).toBeLessThan(390);
    expect(metrics.alpha).toBeGreaterThan(1350);
    expect(metrics.alpha).toBeLessThan(1550);
  });

  it("reports Gnosis inferred fit offensive output without drones", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const metrics = calculateShipCombatMetrics(index, {
      shipTypeId: 3756,
      slots: {
        ...emptySlots,
        high: [
          { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
          { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
          { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
          { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
          { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
          {
            typeId: 43556,
            name: "Skirmish Command Burst II",
            chargeTypeId: 42839,
            chargeName: "Interdiction Maneuvers Charge"
          }
        ],
        mid: [
          { typeId: 5975, name: "50MN Cold-Gas Enduring Microwarpdrive" },
          { typeId: 17500, name: "Caldari Navy Stasis Webifier" },
          { typeId: 17500, name: "Caldari Navy Stasis Webifier" },
          { typeId: 1964, name: "Remote Sensor Booster II", chargeTypeId: 29011, chargeName: "Scan Resolution Script" },
          { typeId: 1964, name: "Remote Sensor Booster II", chargeTypeId: 29011, chargeName: "Scan Resolution Script" },
          { typeId: 1952, name: "Sensor Booster II", chargeTypeId: 29011, chargeName: "Scan Resolution Script" }
        ],
        low: [
          { typeId: 2048, name: "Damage Control II" },
          { typeId: 10190, name: "Magnetic Field Stabilizer II" },
          { typeId: 10190, name: "Magnetic Field Stabilizer II" },
          { typeId: 1335, name: "Reinforced Bulkheads II" },
          { typeId: 1335, name: "Reinforced Bulkheads II" },
          { typeId: 1335, name: "Reinforced Bulkheads II" }
        ],
        rig: [
          { typeId: 33896, name: "Medium Transverse Bulkhead II" },
          { typeId: 33896, name: "Medium Transverse Bulkhead II" },
          { typeId: 33896, name: "Medium Transverse Bulkhead II" }
        ]
      }
    });

    expect(metrics.dpsTotal).toBeGreaterThan(560);
    expect(metrics.dpsTotal).toBeLessThan(620);
    expect(metrics.alpha).toBeGreaterThan(1800);
    expect(metrics.alpha).toBeLessThan(1900);
  });

  it("does not overcount combined Gnosis guns+drones DPS versus component sums", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const gnosisSlots: FitResolvedSlots = {
      ...emptySlots,
      high: [
        { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
        { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
        { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
        { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
        { typeId: 3146, name: "Heavy Neutron Blaster II", chargeTypeId: 12789, chargeName: "Void M" },
        {
          typeId: 43556,
          name: "Skirmish Command Burst II",
          chargeTypeId: 42839,
          chargeName: "Interdiction Maneuvers Charge"
        }
      ],
      mid: [
        { typeId: 5975, name: "50MN Cold-Gas Enduring Microwarpdrive" },
        { typeId: 17500, name: "Caldari Navy Stasis Webifier" },
        { typeId: 17500, name: "Caldari Navy Stasis Webifier" },
        { typeId: 1964, name: "Remote Sensor Booster II", chargeTypeId: 29011, chargeName: "Scan Resolution Script" },
        { typeId: 1964, name: "Remote Sensor Booster II", chargeTypeId: 29011, chargeName: "Scan Resolution Script" },
        { typeId: 1952, name: "Sensor Booster II", chargeTypeId: 29011, chargeName: "Scan Resolution Script" }
      ],
      low: [
        { typeId: 2048, name: "Damage Control II" },
        { typeId: 10190, name: "Magnetic Field Stabilizer II" },
        { typeId: 10190, name: "Magnetic Field Stabilizer II" },
        { typeId: 1335, name: "Reinforced Bulkheads II" },
        { typeId: 1335, name: "Reinforced Bulkheads II" },
        { typeId: 1335, name: "Reinforced Bulkheads II" }
      ],
      rig: [
        { typeId: 33896, name: "Medium Transverse Bulkhead II" },
        { typeId: 33896, name: "Medium Transverse Bulkhead II" },
        { typeId: 33896, name: "Medium Transverse Bulkhead II" }
      ]
    };

    const drones = [
      { typeId: 2185, name: "Hammerhead II", quantity: 2 },
      { typeId: 2185, name: "Hammerhead II", quantity: 3 },
      { typeId: 23707, name: "Hornet EC-300", quantity: 4 }
    ];

    const gunsOnly = calculateShipCombatMetrics(index, {
      shipTypeId: 3756,
      slots: gnosisSlots
    });
    const dronesOnly = calculateShipCombatMetrics(index, {
      shipTypeId: 3756,
      slots: emptySlots,
      drones
    });
    const combined = calculateShipCombatMetrics(index, {
      shipTypeId: 3756,
      slots: gnosisSlots,
      drones
    });

    const expectedCombined = gunsOnly.dpsTotal + dronesOnly.dpsTotal;
    expect(combined.dpsTotal).toBeLessThanOrEqual(expectedCombined + 20);
    expect(combined.dpsTotal).toBeGreaterThanOrEqual(expectedCombined - 20);

    const expectedCombinedAlpha = gunsOnly.alpha + dronesOnly.alpha;
    expect(combined.alpha).toBeLessThanOrEqual(expectedCombinedAlpha + 80);
    expect(combined.alpha).toBeGreaterThanOrEqual(expectedCombinedAlpha - 80);
    expect(combined.alpha).toBeGreaterThan(3200);
    expect(combined.alpha).toBeLessThan(3400);
  });
});
