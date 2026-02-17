import { describe, expect, it } from "vitest";
import {
  collectShipTypeIdsForNaming,
  deriveFitCandidates,
  derivePilotStats,
  deriveShipPredictions,
  summarizeEvidenceCoverage,
  summarizeTopEvidenceShips
} from "./intel";
import type { ParsedPilotInput } from "../types";
import type { ZkillKillmail } from "./api/zkill";

function makeKillmail(params: {
  id: number;
  time: string;
  victimCharacterId?: number;
  victimShipTypeId?: number;
  attackerCharacterId?: number;
  attackerShipTypeId?: number;
  value?: number;
  attackersCount?: number;
}): ZkillKillmail {
  const attackers =
    params.attackersCount && params.attackersCount > 1
      ? [
          {
            character_id: params.attackerCharacterId,
            ship_type_id: params.attackerShipTypeId
          },
          {
            character_id: 999999,
            ship_type_id: 111
          }
        ]
      : [
          {
            character_id: params.attackerCharacterId,
            ship_type_id: params.attackerShipTypeId
          }
        ];

  return {
    killmail_id: params.id,
    killmail_time: params.time,
    victim: {
      character_id: params.victimCharacterId,
      ship_type_id: params.victimShipTypeId
    },
    attackers,
    zkb: {
      totalValue: params.value
    }
  };
}

describe("derivePilotStats", () => {
  it("computes key stat fields from kills and losses", () => {
    const characterId = 1001;
    const kills: ZkillKillmail[] = [
      makeKillmail({
        id: 1,
        time: "2026-02-13T00:00:00Z",
        attackerCharacterId: characterId,
        attackerShipTypeId: 111,
        value: 1_000_000,
        attackersCount: 1
      }),
      makeKillmail({
        id: 2,
        time: "2026-02-12T00:00:00Z",
        attackerCharacterId: characterId,
        attackerShipTypeId: 111,
        value: 2_000_000,
        attackersCount: 2
      })
    ];
    const losses: ZkillKillmail[] = [
      makeKillmail({
        id: 3,
        time: "2026-02-12T06:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 222,
        value: 500_000
      })
    ];

    const stats = derivePilotStats(characterId, kills, losses);
    expect(stats.kills).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.solo).toBe(1);
    expect(stats.iskDestroyed).toBe(3_000_000);
    expect(stats.iskLost).toBe(500_000);
    expect(stats.kdRatio).toBe(2);
  });
});

describe("deriveShipPredictions", () => {
  it("forces explicit pasted ship to rank #1", () => {
    const characterId = 2001;
    const parsedEntry: ParsedPilotInput = {
      pilotName: "Ula",
      explicitShip: "Charon",
      sourceLine: "Ula (Charon)",
      parseConfidence: 0.98,
      shipSource: "explicit"
    };
    const kills: ZkillKillmail[] = [
      makeKillmail({
        id: 11,
        time: "2026-02-13T00:00:00Z",
        attackerCharacterId: characterId,
        attackerShipTypeId: 333
      })
    ];
    const losses: ZkillKillmail[] = [
      makeKillmail({
        id: 12,
        time: "2026-02-12T00:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 444
      })
    ];

    const result = deriveShipPredictions({
      parsedEntry,
      characterId,
      kills,
      losses,
      lookbackDays: 14,
      topShips: 3,
      shipNamesByTypeId: new Map([
        [333, "Sabre"],
        [444, "Stabber"]
      ])
    });

    expect(result).toHaveLength(1);
    expect(result[0].shipName).toBe("Charon");
    expect(result[0].source).toBe("explicit");
    expect(result[0].probability).toBe(100);
  });

  it("maps explicit ship to inferred type id when names match", () => {
    const characterId = 2002;
    const parsedEntry: ParsedPilotInput = {
      pilotName: "Bad Player",
      explicitShip: "Venture",
      sourceLine: "Bad Player (Venture)",
      parseConfidence: 0.98,
      shipSource: "explicit"
    };
    const kills: ZkillKillmail[] = [
      makeKillmail({
        id: 13,
        time: "2026-02-14T00:00:00Z",
        attackerCharacterId: characterId,
        attackerShipTypeId: 32880
      }),
      makeKillmail({
        id: 14,
        time: "2026-02-13T00:00:00Z",
        attackerCharacterId: characterId,
        attackerShipTypeId: 32880
      })
    ];

    const result = deriveShipPredictions({
      parsedEntry,
      characterId,
      kills,
      losses: [],
      lookbackDays: 7,
      topShips: 3,
      shipNamesByTypeId: new Map([[32880, "Venture"]])
    });

    expect(result[0].source).toBe("explicit");
    expect(result[0].shipName).toBe("Venture");
    expect(result[0].shipTypeId).toBe(32880);
    expect(result).toHaveLength(1);
  });

  it("filters out zero-percent inferred ships", () => {
    const characterId = 2003;
    const parsedEntry: ParsedPilotInput = {
      pilotName: "Pilot",
      sourceLine: "Pilot",
      parseConfidence: 0.9,
      shipSource: "inferred"
    };

    const kills: ZkillKillmail[] = [];
    const losses: ZkillKillmail[] = [];
    for (let i = 0; i < 5000; i += 1) {
      losses.push(
        makeKillmail({
          id: 10000 + i,
          time: "2026-02-14T00:00:00Z",
          victimCharacterId: characterId,
          victimShipTypeId: 111
        })
      );
    }
    losses.push(
      makeKillmail({
        id: 20000,
        time: "2026-02-01T00:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 222
      })
    );

    const result = deriveShipPredictions({
      parsedEntry,
      characterId,
      kills,
      losses,
      lookbackDays: 7,
      topShips: 3,
      shipNamesByTypeId: new Map([
        [111, "Ship A"],
        [222, "Ship B"]
      ])
    });

    expect(result.some((entry) => entry.shipName === "Ship B")).toBe(false);
    expect(result.every((entry) => entry.probability > 0)).toBe(true);
  });

  it("uses character-scoped losses even when victim.character_id is missing", () => {
    const characterId = 2004;
    const parsedEntry: ParsedPilotInput = {
      pilotName: "Avizeh",
      sourceLine: "Avizeh",
      parseConfidence: 0.9,
      shipSource: "inferred"
    };

    const losses: ZkillKillmail[] = [
      {
        killmail_id: 30001,
        killmail_time: "2026-02-12T00:00:00Z",
        victim: {
          ship_type_id: 33470
        },
        attackers: [],
        zkb: {}
      }
    ];

    const result = deriveShipPredictions({
      parsedEntry,
      characterId,
      kills: [],
      losses,
      lookbackDays: 7,
      topShips: 3,
      shipNamesByTypeId: new Map([[33470, "Praxis"]])
    });

    expect(result).toHaveLength(1);
    expect(result[0].shipName).toBe("Praxis");
    expect(result[0].probability).toBeGreaterThan(0);
  });

  it("still infers ships from very old history", () => {
    const characterId = 2005;
    const parsedEntry: ParsedPilotInput = {
      pilotName: "Old Pilot",
      sourceLine: "Old Pilot",
      parseConfidence: 0.9,
      shipSource: "inferred"
    };
    const losses: ZkillKillmail[] = [
      makeKillmail({
        id: 40001,
        time: "2018-07-21T21:14:21Z",
        victimCharacterId: characterId,
        victimShipTypeId: 33468
      }),
      makeKillmail({
        id: 40002,
        time: "2018-07-15T20:04:53Z",
        victimCharacterId: characterId,
        victimShipTypeId: 33468
      }),
      makeKillmail({
        id: 40003,
        time: "2018-05-29T01:11:01Z",
        victimCharacterId: characterId,
        victimShipTypeId: 11188
      })
    ];

    const result = deriveShipPredictions({
      parsedEntry,
      characterId,
      kills: [],
      losses,
      lookbackDays: 7,
      topShips: 3,
      shipNamesByTypeId: new Map([
        [33468, "Astero"],
        [11188, "Rifter"]
      ])
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].shipName).toBe("Astero");
    expect(result[0].probability).toBeGreaterThan(0);
  });

  it("excludes capsules from inferred ship candidates", () => {
    const characterId = 2006;
    const parsedEntry: ParsedPilotInput = {
      pilotName: "NoPod",
      sourceLine: "NoPod",
      parseConfidence: 0.9,
      shipSource: "inferred"
    };
    const losses: ZkillKillmail[] = [
      makeKillmail({
        id: 50001,
        time: "2026-02-14T00:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 670
      }),
      makeKillmail({
        id: 50002,
        time: "2026-02-13T00:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 11188
      })
    ];

    const result = deriveShipPredictions({
      parsedEntry,
      characterId,
      kills: [],
      losses,
      lookbackDays: 7,
      topShips: 3,
      shipNamesByTypeId: new Map([
        [670, "Capsule"],
        [11188, "Rifter"]
      ])
    });

    expect(result.some((row) => row.shipName === "Capsule")).toBe(false);
    expect(result).toHaveLength(1);
    expect(result[0].shipName).toBe("Rifter");
    expect(result[0].probability).toBe(100);
  });

  it("excludes deployables and structures from inferred ship candidates", () => {
    const characterId = 2007;
    const parsedEntry: ParsedPilotInput = {
      pilotName: "NoDeployables",
      sourceLine: "NoDeployables",
      parseConfidence: 0.9,
      shipSource: "inferred"
    };
    const losses: ZkillKillmail[] = [
      makeKillmail({
        id: 60001,
        time: "2026-02-14T00:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 900001
      }),
      makeKillmail({
        id: 60002,
        time: "2026-02-13T00:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 11188
      })
    ];

    const result = deriveShipPredictions({
      parsedEntry,
      characterId,
      kills: [],
      losses,
      lookbackDays: 7,
      topShips: 3,
      shipNamesByTypeId: new Map([
        [900001, "Mobile Small Warp Disruptor I"],
        [11188, "Rifter"]
      ])
    });

    expect(result.some((row) => row.shipName.includes("Mobile Small Warp Disruptor"))).toBe(false);
    expect(result).toHaveLength(1);
    expect(result[0].shipName).toBe("Rifter");
  });

  it("lets high-volume older activity outweigh a few very recent kills", () => {
    const characterId = 2008;
    const parsedEntry: ParsedPilotInput = {
      pilotName: "Volume Pilot",
      sourceLine: "Volume Pilot",
      parseConfidence: 0.9,
      shipSource: "inferred"
    };

    const now = Date.now();
    const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const kills: ZkillKillmail[] = [];

    // A few very recent Vargur kills.
    for (let i = 0; i < 3; i += 1) {
      kills.push(
        makeKillmail({
          id: 70000 + i,
          time: daysAgo(i + 1),
          attackerCharacterId: characterId,
          attackerShipTypeId: 19726 // Vargur
        })
      );
    }

    // Many older Daredevil kills (around one month old).
    for (let i = 0; i < 30; i += 1) {
      kills.push(
        makeKillmail({
          id: 71000 + i,
          time: daysAgo(25 + i),
          attackerCharacterId: characterId,
          attackerShipTypeId: 17922 // Daredevil
        })
      );
    }

    const result = deriveShipPredictions({
      parsedEntry,
      characterId,
      kills,
      losses: [],
      lookbackDays: 7,
      topShips: 3,
      shipNamesByTypeId: new Map([
        [19726, "Vargur"],
        [17922, "Daredevil"]
      ])
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].shipName).toBe("Daredevil");
    expect(result[0].probability).toBeGreaterThan(result.find((row) => row.shipName === "Vargur")?.probability ?? 0);
  });
});

describe("collectShipTypeIdsForNaming", () => {
  it("extracts ship type IDs used by the pilot in kills and losses", () => {
    const characterId = 3001;
    const kills: ZkillKillmail[] = [
      makeKillmail({
        id: 21,
        time: "2026-02-13T00:00:00Z",
        attackerCharacterId: characterId,
        attackerShipTypeId: 500
      })
    ];
    const losses: ZkillKillmail[] = [
      makeKillmail({
        id: 22,
        time: "2026-02-11T00:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 600
      })
    ];

    const ids = collectShipTypeIdsForNaming(kills, losses, characterId);
    expect(ids.sort((a, b) => a - b)).toEqual([500, 600]);
  });
});

describe("deriveFitCandidates", () => {
  it("picks the most frequent recent loss-fit signature per predicted ship", () => {
    const characterId = 4001;
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 31,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 700,
          items: [
            { item_type_id: 9001, flag: 27 },
            { item_type_id: 9002, flag: 19 },
            { item_type_id: 9003, flag: 12 }
          ]
        },
        attackers: [],
        zkb: {}
      },
      {
        killmail_id: 32,
        killmail_time: "2026-02-09T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 700,
          items: [
            { item_type_id: 9001, flag: 27 },
            { item_type_id: 9002, flag: 19 },
            { item_type_id: 9003, flag: 12 }
          ]
        },
        attackers: [],
        zkb: {}
      },
      {
        killmail_id: 33,
        killmail_time: "2026-02-08T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 700,
          items: [{ item_type_id: 9010, flag: 27 }, { item_type_id: 9011, flag: 19 }]
        },
        attackers: [],
        zkb: {}
      }
    ];

    const fits = deriveFitCandidates({
      characterId,
      losses,
      predictedShips: [
        {
          shipTypeId: 700,
          shipName: "Sabre",
          probability: 55,
          source: "inferred",
          reason: []
        }
      ],
      itemNamesByTypeId: new Map([
        [9001, "Warp Scrambler II"],
        [9002, "5MN Microwarpdrive II"],
        [9003, "Medium Shield Extender II"],
        [9010, "Different Mod A"],
        [9011, "Different Mod B"]
      ])
    });

    expect(fits).toHaveLength(1);
    expect(fits[0].fitLabel).toContain("Warp Scrambler II");
    expect(fits[0].confidence).toBeGreaterThan(60);
    expect(fits[0].alternates).toHaveLength(1);
    expect(fits[0].alternates[0].fitLabel).toContain("Different Mod A");
    expect(fits[0].eftSections?.high).toContain("Warp Scrambler II");
    expect(fits[0].eftSections?.mid).toContain("5MN Microwarpdrive II");
    expect(fits[0].eftSections?.low).toContain("Medium Shield Extender II");
    expect(fits[0].modulesBySlot?.high[0].typeId).toBe(9001);
    expect(fits[0].modulesBySlot?.high[0].name).toBe("Warp Scrambler II");
    expect(fits[0].modulesBySlot?.mid[0].typeId).toBe(9002);
    expect(fits[0].modulesBySlot?.low[0].typeId).toBe(9003);
  });

  it("does not truncate >20 items and prefers module over charge-like item per slot", () => {
    const characterId = 4002;
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 41,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 800,
          items: [
            { item_type_id: 9100, flag: 11 },
            { item_type_id: 9101, flag: 12 },
            { item_type_id: 9102, flag: 13 },
            { item_type_id: 9103, flag: 14 },
            { item_type_id: 9200, flag: 19 },
            { item_type_id: 9201, flag: 20 },
            { item_type_id: 9300, flag: 27 },
            { item_type_id: 9400, flag: 27 }, // charge-like for same slot
            { item_type_id: 9301, flag: 28 },
            { item_type_id: 9400, flag: 28 }, // charge-like for same slot
            { item_type_id: 9302, flag: 29 },
            { item_type_id: 9400, flag: 29 }, // charge-like for same slot
            { item_type_id: 9303, flag: 30 },
            { item_type_id: 9400, flag: 30 }, // charge-like for same slot
            { item_type_id: 9304, flag: 31 },
            { item_type_id: 9500, flag: 31 }, // probe for same slot
            { item_type_id: 9305, flag: 32 },
            { item_type_id: 9400, flag: 32 },
            { item_type_id: 9306, flag: 33 },
            { item_type_id: 9400, flag: 33 },
            { item_type_id: 9307, flag: 34 },
            { item_type_id: 9400, flag: 34 },
            { item_type_id: 9600, flag: 92 },
            { item_type_id: 9601, flag: 93 }
          ]
        },
        attackers: [],
        zkb: {}
      }
    ];

    const fits = deriveFitCandidates({
      characterId,
      losses,
      predictedShips: [
        {
          shipTypeId: 800,
          shipName: "Eris",
          probability: 100,
          source: "inferred",
          reason: []
        }
      ],
      itemNamesByTypeId: new Map([
        [9100, "IFFA Compact Damage Control"],
        [9101, "Magnetic Field Stabilizer II"],
        [9102, "Nanofiber Internal Structure II"],
        [9103, "Vortex Compact Magnetic Field Stabilizer"],
        [9200, "5MN Y-T8 Compact Microwarpdrive"],
        [9201, "Dread Guristas Warp Scrambler"],
        [9300, "Interdiction Sphere Launcher I"],
        [9301, "Light Neutron Blaster II"],
        [9302, "Light Neutron Blaster II"],
        [9303, "Light Neutron Blaster II"],
        [9304, "Light Neutron Blaster II"],
        [9305, "Light Neutron Blaster II"],
        [9306, "Light Neutron Blaster II"],
        [9307, "Light Neutron Blaster II"],
        [9400, "Void S"],
        [9500, "Warp Disrupt Probe"],
        [9600, "Small Transverse Bulkhead II"],
        [9601, "Small Transverse Bulkhead II"]
      ])
    });

    expect(fits).toHaveLength(1);
    const sections = fits[0].eftSections!;
    expect(sections.low).toContain("Vortex Compact Magnetic Field Stabilizer");
    expect(sections.mid).toContain("Dread Guristas Warp Scrambler");
    expect(sections.high.filter((row) => row === "Light Neutron Blaster II,Void S")).toHaveLength(6);
    expect(sections.high).toContain("Light Neutron Blaster II");
    expect(sections.high).toContain("Interdiction Sphere Launcher I,Void S");
    expect(sections.high.some((row) => row === "Light Neutron Blaster II,Warp Disrupt Probe")).toBe(false);
    expect(sections.high.some((row) => row === "Void S")).toBe(false);
    expect(sections.high.some((row) => row === "Warp Disrupt Probe")).toBe(false);
  });

  it("pairs launcher ammo to launcher modules and does not emit standalone rocket ammo", () => {
    const characterId = 4010;
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 91,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 91000,
          items: [
            { item_type_id: 10631, flag: 27 },
            { item_type_id: 24473, flag: 27 },
            { item_type_id: 10631, flag: 28 },
            { item_type_id: 24473, flag: 28 },
            { item_type_id: 10631, flag: 29 },
            { item_type_id: 24473, flag: 29 },
            { item_type_id: 22782, flag: 30 },
            { item_type_id: 22778, flag: 30 }
          ]
        },
        attackers: [],
        zkb: {}
      }
    ];

    const fits = deriveFitCandidates({
      characterId,
      losses,
      predictedShips: [
        {
          shipTypeId: 91000,
          shipName: "Heretic",
          probability: 100,
          source: "inferred",
          reason: []
        }
      ],
      itemNamesByTypeId: new Map([
        [10631, "Rocket Launcher II"],
        [24473, "Nova Rage Rocket"],
        [22782, "Interdiction Sphere Launcher I"],
        [22778, "Warp Disrupt Probe"]
      ])
    });

    expect(fits).toHaveLength(1);
    const high = fits[0].eftSections!.high;
    expect(high.filter((entry) => entry === "Rocket Launcher II,Nova Rage Rocket")).toHaveLength(3);
    expect(high).toContain("Interdiction Sphere Launcher I,Warp Disrupt Probe");
    expect(high).not.toContain("Nova Rage Rocket");
  });

  it("keeps launcher ammo pairing when ammo is only present via charge_item_type_id", () => {
    const characterId = 4011;
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 92,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 91001,
          items: [
            { item_type_id: 10631, flag: 28, charge_item_type_id: 24473 },
            { item_type_id: 10631, flag: 29, charge_item_type_id: 24473 },
            { item_type_id: 22782, flag: 30, charge_item_type_id: 22778 }
          ]
        },
        attackers: [],
        zkb: {}
      }
    ];

    const fits = deriveFitCandidates({
      characterId,
      losses,
      predictedShips: [
        {
          shipTypeId: 91001,
          shipName: "Heretic",
          probability: 100,
          source: "inferred",
          reason: []
        }
      ],
      itemNamesByTypeId: new Map([
        [10631, "Rocket Launcher II"],
        [24473, "Nova Rage Rocket"],
        [22782, "Interdiction Sphere Launcher I"],
        [22778, "Warp Disrupt Probe"]
      ])
    });

    expect(fits).toHaveLength(1);
    const high = fits[0].eftSections!.high;
    expect(high.filter((entry) => entry === "Rocket Launcher II,Nova Rage Rocket")).toHaveLength(2);
    expect(high).toContain("Interdiction Sphere Launcher I,Warp Disrupt Probe");
    expect(high).not.toContain("Nova Rage Rocket");
  });

  it("includes drone bay entries in inferred EFT output", () => {
    const characterId = 4012;
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 93,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 593,
          items: [
            { item_type_id: 7579, flag: 27 },
            { item_type_id: 23009, flag: 27 },
            { item_type_id: 7579, flag: 28 },
            { item_type_id: 23009, flag: 28 },
            { item_type_id: 31888, flag: 87, quantity_destroyed: 3 }
          ]
        },
        attackers: [],
        zkb: {}
      }
    ];

    const fits = deriveFitCandidates({
      characterId,
      losses,
      predictedShips: [
        {
          shipTypeId: 593,
          shipName: "Tristan",
          probability: 100,
          source: "inferred",
          reason: []
        }
      ],
      itemNamesByTypeId: new Map([
        [7579, "Modal Light Neutron Particle Accelerator I"],
        [23009, "Caldari Navy Antimatter Charge S"],
        [31888, "Warrior II"]
      ])
    });

    expect(fits).toHaveLength(1);
    expect(fits[0].eftSections?.high.filter((entry) => entry === "Modal Light Neutron Particle Accelerator I,Caldari Navy Antimatter Charge S")).toHaveLength(2);
    expect(fits[0].eftSections?.other).toContain("Warrior II x3");
    expect(fits[0].modulesBySlot?.other[0].quantity).toBe(3);
  });
});

describe("summaries", () => {
  it("summarizes evidence coverage counters", () => {
    const characterId = 777;
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 1,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {},
        attackers: [],
        zkb: {}
      },
      {
        killmail_id: 2,
        killmail_time: "2026-02-09T00:00:00Z",
        victim: {},
        attackers: [{ character_id: 999, ship_type_id: 123 }],
        zkb: {}
      },
      {
        killmail_id: 3,
        killmail_time: "2026-02-08T00:00:00Z",
        victim: {},
        attackers: [{ character_id: characterId, ship_type_id: 321 }],
        zkb: {}
      }
    ];
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 4,
        killmail_time: "2026-02-07T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 456
        },
        attackers: [],
        zkb: {}
      },
      {
        killmail_id: 5,
        killmail_time: "2026-02-06T00:00:00Z",
        victim: {
          character_id: 42,
          ship_type_id: 457
        },
        attackers: [],
        zkb: {}
      }
    ];

    const summary = summarizeEvidenceCoverage(characterId, kills, losses);

    expect(summary.totalKills).toBe(3);
    expect(summary.totalLosses).toBe(2);
    expect(summary.killRowsWithoutAttackers).toBe(1);
    expect(summary.killRowsWithAttackersButNoCharacterMatch).toBe(1);
    expect(summary.killRowsWithMatchedAttackerShip).toBe(1);
    expect(summary.lossRowsWithVictimShip).toBe(1);
  });

  it("returns top evidence ships in descending total order with fallback names", () => {
    const characterId = 100;
    const kills: ZkillKillmail[] = [
      makeKillmail({
        id: 10,
        time: "2026-02-10T00:00:00Z",
        attackerCharacterId: characterId,
        attackerShipTypeId: 2001
      }),
      makeKillmail({
        id: 11,
        time: "2026-02-09T00:00:00Z",
        attackerCharacterId: characterId,
        attackerShipTypeId: 2001
      }),
      makeKillmail({
        id: 12,
        time: "2026-02-08T00:00:00Z",
        attackerCharacterId: characterId,
        attackerShipTypeId: 2002
      })
    ];
    const losses: ZkillKillmail[] = [
      makeKillmail({
        id: 13,
        time: "2026-02-07T00:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 2002
      }),
      makeKillmail({
        id: 14,
        time: "2026-02-06T00:00:00Z",
        victimCharacterId: characterId,
        victimShipTypeId: 2999
      })
    ];

    const rows = summarizeTopEvidenceShips({
      characterId,
      kills,
      losses,
      shipNamesByTypeId: new Map([
        [2001, "Rifter"],
        [2002, "Thrasher"]
      ]),
      limit: 2
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      shipTypeId: 2001,
      shipName: "Rifter",
      kills: 2,
      losses: 0,
      total: 2
    });
    expect(rows[1]).toMatchObject({
      shipTypeId: 2002,
      shipName: "Thrasher",
      kills: 1,
      losses: 1,
      total: 2
    });
  });
});
