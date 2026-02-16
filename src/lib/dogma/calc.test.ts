import { describe, expect, it } from "vitest";
import { calculateShipCombatMetrics } from "./calc";
import { buildDogmaIndex } from "./index";
import type { DogmaPack, FitResolvedSlots } from "./types";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
});
