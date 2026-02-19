import { describe, expect, it } from "vitest";
import { deriveShipCynoBaitEvidence, estimateShipCynoChance, evaluateCynoRisk } from "./cyno";
import type { ZkillKillmail } from "./api/zkill";
import type { FitCandidate, ShipPrediction } from "./intel";

describe("evaluateCynoRisk", () => {
  it("does not flag potential cyno with hull-only signal and no module evidence", () => {
    const risk = evaluateCynoRisk({
      predictedShips: [
        {
          shipName: "Falcon",
          probability: 60,
          source: "inferred",
          reason: [],
          shipTypeId: 1
        }
      ],
      characterId: 10,
      kills: [],
      losses: [],
      namesByTypeId: new Map()
    });

    expect(risk.potentialCyno).toBe(false);
  });

  it("flags potential cyno for Viator when losses contain cyno module", () => {
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 2,
        killmail_time: "2026-02-13T00:00:00Z",
        victim: { character_id: 10, ship_type_id: 100, items: [{ item_type_id: 7000 }] },
        attackers: [],
        zkb: {}
      }
    ];
    const risk = evaluateCynoRisk({
      predictedShips: [
        {
          shipName: "Viator",
          probability: 72,
          source: "inferred",
          reason: [],
          shipTypeId: 2
        }
      ],
      characterId: 10,
      kills: [],
      losses,
      namesByTypeId: new Map([[7000, "Covert Cynosural Field Generator I"]])
    });

    expect(risk.potentialCyno).toBe(true);
  });

  it("flags potential cyno for Impel when losses contain industrial cyno module", () => {
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 3,
        killmail_time: "2026-02-13T00:00:00Z",
        victim: { character_id: 10, ship_type_id: 101, items: [{ item_type_id: 8000 }] },
        attackers: [],
        zkb: {}
      }
    ];
    const risk = evaluateCynoRisk({
      predictedShips: [
        {
          shipName: "Impel",
          probability: 70,
          source: "inferred",
          reason: [],
          shipTypeId: 3
        }
      ],
      characterId: 10,
      kills: [],
      losses,
      namesByTypeId: new Map([[8000, "Industrial Cynosural Field Generator I"]])
    });

    expect(risk.potentialCyno).toBe(true);
  });

  it("flags potential cyno for Venture when losses contain industrial cyno module", () => {
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 4,
        killmail_time: "2026-02-13T00:00:00Z",
        victim: { character_id: 10, ship_type_id: 102, items: [{ item_type_id: 8100 }] },
        attackers: [],
        zkb: {}
      }
    ];
    const risk = evaluateCynoRisk({
      predictedShips: [
        {
          shipName: "Venture",
          probability: 68,
          source: "inferred",
          reason: [],
          shipTypeId: 4
        }
      ],
      characterId: 10,
      kills: [],
      losses,
      namesByTypeId: new Map([[8100, "Industrial Cynosural Field Generator"]])
    });

    expect(risk.potentialCyno).toBe(true);
  });

  it("does not flag bait from jump-capable history alone", () => {
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 1,
        killmail_time: "2026-02-13T00:00:00Z",
        victim: {},
        attackers: [{ character_id: 10, ship_type_id: 900 }],
        zkb: {}
      }
    ];

    const risk = evaluateCynoRisk({
      predictedShips: [
        {
          shipName: "Drake",
          probability: 80,
          source: "inferred",
          reason: [],
          shipTypeId: 999
        }
      ],
      characterId: 10,
      kills,
      losses: [],
      namesByTypeId: new Map([[900, "Archon"]])
    });

    expect(risk.jumpAssociation).toBe(false);
  });

  it("flags bait for cyno+tackle+tank profile on likely ship", () => {
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 5,
        killmail_time: "2026-02-13T00:00:00Z",
        victim: {
          character_id: 10,
          ship_type_id: 700,
          items: [{ item_type_id: 5000 }, { item_type_id: 5001 }, { item_type_id: 5002 }]
        },
        attackers: [],
        zkb: {}
      }
    ];

    const risk = evaluateCynoRisk({
      predictedShips: [
        {
          shipName: "Devoter",
          probability: 90,
          source: "inferred",
          reason: [],
          shipTypeId: 700
        }
      ],
      characterId: 10,
      kills: [],
      losses,
      namesByTypeId: new Map([
        [700, "Devoter"],
        [5000, "Cynosural Field Generator I"],
        [5001, "Warp Scrambler II"],
        [5002, "Damage Control II"]
      ])
    });

    expect(risk.jumpAssociation).toBe(true);
  });
});

describe("estimateShipCynoChance", () => {
  it("returns 100% when same-hull losses show cyno module evidence", () => {
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 10,
        killmail_time: "2026-02-13T00:00:00Z",
        victim: {
          character_id: 55,
          ship_type_id: 200,
          items: [{ item_type_id: 9000 }]
        },
        attackers: [],
        zkb: {}
      }
    ];

    const result = estimateShipCynoChance({
      predictedShips: [
        {
          shipName: "Falcon",
          probability: 70,
          source: "inferred",
          reason: [],
          shipTypeId: 200
        },
        {
          shipName: "Drake",
          probability: 30,
          source: "inferred",
          reason: [],
          shipTypeId: 201
        }
      ],
      characterId: 55,
      losses,
      namesByTypeId: new Map([
        [200, "Falcon"],
        [201, "Drake"],
        [9000, "Covert Cynosural Field Generator I"]
      ])
    });

    expect(result.get("Falcon")?.cynoCapable).toBe(true);
    expect(result.get("Falcon")?.cynoChance).toBe(100);
    expect(result.get("Drake")).toEqual({ cynoCapable: false, cynoChance: 0 });
  });

  it("returns intermediate chance when only other-hull cyno evidence exists", () => {
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 11,
        killmail_time: "2026-02-13T00:00:00Z",
        victim: {
          character_id: 55,
          ship_type_id: 300,
          items: [{ item_type_id: 9001 }]
        },
        attackers: [],
        zkb: {}
      }
    ];

    const result = estimateShipCynoChance({
      predictedShips: [
        {
          shipName: "Viator",
          probability: 60,
          source: "inferred",
          reason: [],
          shipTypeId: 301
        }
      ],
      characterId: 55,
      losses,
      namesByTypeId: new Map([
        [300, "Falcon"],
        [301, "Viator"],
        [9001, "Covert Cynosural Field Generator I"]
      ])
    });

    const chance = result.get("Viator")?.cynoChance ?? 0;
    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThan(100);
  });

  it("returns low baseline chance for cyno-capable hull with no fit evidence", () => {
    const result = estimateShipCynoChance({
      predictedShips: [
        {
          shipName: "Impel",
          probability: 80,
          source: "inferred",
          reason: [],
          shipTypeId: 302
        }
      ],
      characterId: 55,
      losses: [],
      namesByTypeId: new Map([[302, "Impel"]])
    });

    const chance = result.get("Impel")?.cynoChance ?? 0;
    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThan(40);
  });

  it("returns 0% for non-cyno-capable hull", () => {
    const result = estimateShipCynoChance({
      predictedShips: [
        {
          shipName: "Drake",
          probability: 95,
          source: "inferred",
          reason: [],
          shipTypeId: 500
        }
      ],
      characterId: 55,
      losses: [
        {
          killmail_id: 12,
          killmail_time: "2026-02-13T00:00:00Z",
          victim: {
            character_id: 55,
            ship_type_id: 500,
            items: [{ item_type_id: 9002 }]
          },
          attackers: [],
          zkb: {}
        }
      ],
      namesByTypeId: new Map([
        [500, "Drake"],
        [9002, "Covert Cynosural Field Generator I"]
      ])
    });

    expect(result.get("Drake")).toEqual({ cynoCapable: false, cynoChance: 0 });
  });
});

function inferredShip(partial: Partial<ShipPrediction>): ShipPrediction {
  return {
    shipName: "Test Ship",
    probability: 60,
    source: "inferred",
    reason: [],
    ...partial
  };
}

function fit(partial: Partial<FitCandidate>): FitCandidate {
  return {
    shipTypeId: 1,
    fitLabel: "Inferred fit",
    confidence: 1,
    alternates: [],
    ...partial
  };
}

describe("deriveShipCynoBaitEvidence", () => {
  it("returns no cyno/bait evidence for heuristic-only ships without qualifying modules", () => {
    const evidence = deriveShipCynoBaitEvidence({
      predictedShips: [
        inferredShip({
          shipName: "Onyx",
          shipTypeId: 700,
          cynoCapable: true,
          cynoChance: 100
        })
      ],
      fitCandidates: [fit({ shipTypeId: 700, fitLabel: "No modules" })],
      kills: [],
      losses: [],
      characterId: 10,
      namesByTypeId: new Map([[700, "Onyx"]])
    });

    expect(evidence.get("Onyx")?.Cyno).toBeUndefined();
    expect(evidence.get("Onyx")?.Bait).toBeUndefined();
  });

  it("does not derive bait evidence from losses-only module fits", () => {
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 42,
        killmail_time: "2026-02-14T11:00:00Z",
        victim: { character_id: 10, ship_type_id: 700, items: [{ item_type_id: 5002 }] },
        attackers: [],
        zkb: {}
      }
    ];

    const evidence = deriveShipCynoBaitEvidence({
      predictedShips: [inferredShip({ shipName: "Devoter", shipTypeId: 700 })],
      fitCandidates: [fit({ shipTypeId: 700, fitLabel: "Heavy tackle fit" })],
      kills: [],
      losses,
      characterId: 10,
      namesByTypeId: new Map([
        [700, "Devoter"],
        [5002, "Damage Control II"]
      ])
    });

    expect(evidence.get("Devoter")?.Bait).toBeUndefined();
  });

  it("does not derive bait evidence for combat hulls even with matched non-solo killmail", () => {
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 49,
        killmail_time: "2026-02-19T13:00:00Z",
        victim: { ship_type_id: 603 },
        attackers: [
          { character_id: 10, ship_type_id: 700 },
          { character_id: 11, ship_type_id: 602 }
        ],
        zkb: {}
      }
    ];

    const evidence = deriveShipCynoBaitEvidence({
      predictedShips: [inferredShip({ shipName: "Devoter", shipTypeId: 700 })],
      fitCandidates: [fit({ shipTypeId: 700, fitLabel: "Heavy tackle fit" })],
      kills,
      losses: [],
      characterId: 10,
      namesByTypeId: new Map([
        [700, "Devoter"],
        [603, "Merlin"]
      ])
    });

    expect(evidence.get("Devoter")?.Bait).toBeUndefined();
  });

  it("does not derive bait evidence from solo killmails", () => {
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 47,
        killmail_time: "2026-02-19T11:00:00Z",
        victim: { ship_type_id: 603 },
        attackers: [{ character_id: 10, ship_type_id: 700 }],
        zkb: {}
      }
    ];

    const evidence = deriveShipCynoBaitEvidence({
      predictedShips: [inferredShip({ shipName: "Devoter", shipTypeId: 700 })],
      fitCandidates: [fit({ shipTypeId: 700, fitLabel: "Heavy tackle fit" })],
      kills,
      losses: [],
      characterId: 10,
      namesByTypeId: new Map([
        [700, "Devoter"],
        [603, "Merlin"]
      ])
    });

    expect(evidence.get("Devoter")?.Bait).toBeUndefined();
  });

  it("does not derive bait evidence when zkill labels kill as solo", () => {
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 50,
        killmail_time: "2026-02-19T14:00:00Z",
        victim: { ship_type_id: 603 },
        attackers: [
          { character_id: 10, ship_type_id: 701 },
          { character_id: undefined, ship_type_id: 12198 }
        ],
        zkb: { solo: true } as unknown as ZkillKillmail["zkb"]
      }
    ];

    const evidence = deriveShipCynoBaitEvidence({
      predictedShips: [inferredShip({ shipName: "Viator", shipTypeId: 701 })],
      fitCandidates: [fit({ shipTypeId: 701, fitLabel: "Travel fit" })],
      kills,
      losses: [],
      characterId: 10,
      namesByTypeId: new Map([
        [701, "Viator"],
        [603, "Merlin"]
      ])
    });

    expect(evidence.get("Viator")?.Bait).toBeUndefined();
  });

  it("does not derive bait evidence from pod killmails", () => {
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 48,
        killmail_time: "2026-02-19T12:00:00Z",
        victim: { ship_type_id: 670 },
        attackers: [
          { character_id: 10, ship_type_id: 700 },
          { character_id: 11, ship_type_id: 601 }
        ],
        zkb: {}
      }
    ];

    const evidence = deriveShipCynoBaitEvidence({
      predictedShips: [inferredShip({ shipName: "Viator", shipTypeId: 701 })],
      fitCandidates: [fit({ shipTypeId: 701, fitLabel: "Travel fit" })],
      kills,
      losses: [],
      characterId: 10,
      namesByTypeId: new Map([
        [701, "Viator"],
        [670, "Capsule"]
      ])
    });

    expect(evidence.get("Viator")?.Bait).toBeUndefined();
  });

  it("selects the most recent valid cyno and killmail bait evidence per ship", () => {
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 40,
        killmail_time: "2026-02-10T11:00:00Z",
        victim: { character_id: 10, ship_type_id: 701, items: [{ item_type_id: 5000 }] },
        attackers: [],
        zkb: {}
      },
      {
        killmail_id: 41,
        killmail_time: "2026-02-13T11:00:00Z",
        victim: { character_id: 10, ship_type_id: 701, items: [{ item_type_id: 5000 }] },
        attackers: [],
        zkb: {}
      },
      {
        killmail_id: 42,
        killmail_time: "2026-02-14T11:00:00Z",
        victim: { character_id: 10, ship_type_id: 701, items: [{ item_type_id: 5002 }] },
        attackers: [],
        zkb: {}
      }
    ];
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 43,
        killmail_time: "2026-02-15T11:00:00Z",
        victim: { ship_type_id: 603 },
        attackers: [
          { character_id: 10, ship_type_id: 701 },
          { character_id: 12, ship_type_id: 602 }
        ],
        zkb: {}
      },
      {
        killmail_id: 44,
        killmail_time: "2026-02-16T11:00:00Z",
        victim: { ship_type_id: 603 },
        attackers: [
          { character_id: 10, ship_type_id: 999 },
          { character_id: 12, ship_type_id: 602 }
        ],
        zkb: {}
      },
      {
        killmail_id: 45,
        killmail_time: "2026-02-17T11:00:00Z",
        victim: { ship_type_id: 603 },
        attackers: [
          { character_id: 999, ship_type_id: 701 },
          { character_id: 12, ship_type_id: 602 }
        ],
        zkb: {}
      },
      {
        killmail_id: 46,
        killmail_time: "2026-02-18T11:00:00Z",
        victim: { ship_type_id: 603 },
        attackers: [
          { character_id: 10, ship_type_id: 701 },
          { character_id: 12, ship_type_id: 602 }
        ],
        zkb: {}
      }
    ];

    const evidence = deriveShipCynoBaitEvidence({
      predictedShips: [inferredShip({ shipName: "Viator", shipTypeId: 701 })],
      fitCandidates: [fit({ shipTypeId: 701, fitLabel: "Travel fit" })],
      kills,
      losses,
      characterId: 10,
      namesByTypeId: new Map([
        [701, "Viator"],
        [5000, "Cynosural Field Generator I"],
        [5002, "Damage Control II"]
      ])
    });

    expect(evidence.get("Viator")).toEqual({
      Cyno: {
        pillName: "Cyno",
        causingModule: "Cynosural Field Generator I",
        fitId: "701:Travel fit",
        killmailId: 41,
        url: "https://zkillboard.com/kill/41/",
        timestamp: "2026-02-13T11:00:00.000Z"
      },
      Bait: {
        pillName: "Bait",
        causingModule: "Matched attacker ship on killmail",
        fitId: "701:Travel fit",
        killmailId: 46,
        url: "https://zkillboard.com/kill/46/",
        timestamp: "2026-02-18T11:00:00.000Z"
      }
    });
  });
});
