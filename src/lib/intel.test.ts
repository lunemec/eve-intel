import { describe, expect, it } from "vitest";
import { collectShipTypeIdsForNaming, deriveFitCandidates, derivePilotStats, deriveShipPredictions } from "./intel";
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
  });
});
