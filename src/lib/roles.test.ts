import { describe, expect, it } from "vitest";
import type { ZkillKillmail } from "./api/zkill";
import type { FitCandidate, ShipPrediction } from "./intel";
import { deriveShipRolePills } from "./roles";

function makeLoss(params: {
  killmailId: number;
  characterId: number;
  shipTypeId: number;
  itemTypeIds: number[];
}): ZkillKillmail {
  return {
    killmail_id: params.killmailId,
    killmail_time: "2026-02-14T00:00:00Z",
    victim: {
      character_id: params.characterId,
      ship_type_id: params.shipTypeId,
      items: params.itemTypeIds.map((itemTypeId) => ({ item_type_id: itemTypeId }))
    },
    attackers: [],
    zkb: {}
  };
}

describe("deriveShipRolePills", () => {
  it("detects long point/web/neut/cloaky from module evidence", () => {
    const characterId = 9001;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 22456,
        shipName: "Lachesis",
        probability: 60,
        source: "inferred",
        reason: []
      }
    ];
    const fitCandidates: FitCandidate[] = [
      {
        shipTypeId: 22456,
        fitLabel: "example",
        confidence: 100,
        eftSections: {
          high: ["Heavy Energy Neutralizer II", "Covert Ops Cloaking Device II"],
          mid: ["Warp Disruptor II", "Stasis Webifier II"],
          low: [],
          rig: [],
          cargo: [],
          other: []
        },
        alternates: []
      }
    ];

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates,
      losses: [],
      characterId,
      namesByTypeId: new Map()
    });

    expect(rolesByShip.get("Lachesis")).toEqual(
      expect.arrayContaining(["Long Point", "Web", "Neut", "Cloaky"])
    );
    expect(rolesByShip.get("Lachesis")).not.toEqual(expect.arrayContaining(["Tackle"]));
  });

  it("does not mark Cloaky from losses only when fit has no cloak", () => {
    const characterId = 9007;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 22456,
        shipName: "Lachesis",
        probability: 61,
        source: "inferred",
        reason: []
      }
    ];
    const fitCandidates: FitCandidate[] = [
      {
        shipTypeId: 22456,
        fitLabel: "example",
        confidence: 100,
        eftSections: {
          high: ["Heavy Energy Neutralizer II"],
          mid: ["Warp Disruptor II"],
          low: [],
          rig: [],
          cargo: [],
          other: []
        },
        alternates: []
      }
    ];
    const losses: ZkillKillmail[] = [
      makeLoss({
        killmailId: 4,
        characterId,
        shipTypeId: 22456,
        itemTypeIds: [401]
      })
    ];
    const namesByTypeId = new Map<number, string>([[401, "Covert Ops Cloaking Device II"]]);

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates,
      losses,
      characterId,
      namesByTypeId
    });

    expect(rolesByShip.get("Lachesis")).not.toEqual(expect.arrayContaining(["Cloaky"]));
  });

  it("deduplicates HIC/Bubble to HIC", () => {
    const characterId = 9002;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 12013,
        shipName: "Devoter",
        probability: 75,
        source: "inferred",
        reason: []
      }
    ];
    const fitCandidates: FitCandidate[] = [];
    const losses: ZkillKillmail[] = [
      makeLoss({
        killmailId: 1,
        characterId,
        shipTypeId: 12013,
        itemTypeIds: [111]
      })
    ];
    const namesByTypeId = new Map<number, string>([[111, "Warp Disruption Field Generator I"]]);

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates,
      losses,
      characterId,
      namesByTypeId
    });

    expect(rolesByShip.get("Devoter")).toEqual(expect.arrayContaining(["HIC"]));
    expect(rolesByShip.get("Devoter")).not.toEqual(expect.arrayContaining(["Bubble"]));
  });

  it("shows Bubble on interdictor hull", () => {
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 22464,
        shipName: "Sabre",
        probability: 70,
        source: "inferred",
        reason: []
      }
    ];

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses: [],
      characterId: 9003,
      namesByTypeId: new Map()
    });

    expect(rolesByShip.get("Sabre")).toEqual(expect.arrayContaining(["Bubble"]));
  });

  it("keeps Bubble when present without Dictor/HIC", () => {
    const characterId = 9006;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 22456,
        shipName: "Lachesis",
        probability: 55,
        source: "inferred",
        reason: []
      }
    ];
    const losses: ZkillKillmail[] = [
      makeLoss({
        killmailId: 3,
        characterId,
        shipTypeId: 22456,
        itemTypeIds: [301]
      })
    ];
    const namesByTypeId = new Map<number, string>([[301, "Interdiction Sphere Launcher I"]]);

    const fitCandidates: FitCandidate[] = [
      {
        shipTypeId: 22456,
        fitLabel: "example",
        confidence: 100,
        eftSections: {
          high: [],
          mid: [],
          low: [],
          rig: [],
          cargo: [],
          other: []
        },
        alternates: []
      }
    ];

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates,
      losses,
      characterId,
      namesByTypeId
    });

    expect(rolesByShip.get("Lachesis")).toEqual(expect.arrayContaining(["Bubble"]));
  });

  it("detects Boosh on command destroyer hull", () => {
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 37453,
        shipName: "Stork",
        probability: 66,
        source: "inferred",
        reason: []
      }
    ];

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses: [],
      characterId: 9005,
      namesByTypeId: new Map()
    });

    expect(rolesByShip.get("Stork")).toEqual(expect.arrayContaining(["Boosh"]));
  });

  it("detects Armor Logi from remote armor modules", () => {
    const characterId = 9004;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 11985,
        shipName: "Guardian",
        probability: 52,
        source: "inferred",
        reason: []
      }
    ];
    const losses: ZkillKillmail[] = [
      makeLoss({
        killmailId: 2,
        characterId,
        shipTypeId: 11985,
        itemTypeIds: [201]
      })
    ];
    const namesByTypeId = new Map<number, string>([[201, "Large Remote Armor Repairer II"]]);

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses,
      characterId,
      namesByTypeId
    });

    expect(rolesByShip.get("Guardian")).toEqual(expect.arrayContaining(["Armor Logi"]));
    expect(rolesByShip.get("Guardian")).not.toEqual(expect.arrayContaining(["Shield Logi"]));
  });

  it("detects Shield Logi from remote shield modules", () => {
    const characterId = 9011;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 11987,
        shipName: "Basilisk",
        probability: 58,
        source: "inferred",
        reason: []
      }
    ];
    const losses: ZkillKillmail[] = [
      makeLoss({
        killmailId: 5,
        characterId,
        shipTypeId: 11987,
        itemTypeIds: [202]
      })
    ];
    const namesByTypeId = new Map<number, string>([[202, "Large Remote Shield Booster II"]]);

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses,
      characterId,
      namesByTypeId
    });

    expect(rolesByShip.get("Basilisk")).toEqual(expect.arrayContaining(["Shield Logi"]));
    expect(rolesByShip.get("Basilisk")).not.toEqual(expect.arrayContaining(["Armor Logi"]));
  });

  it("ignores cargo modules when deriving roles", () => {
    const characterId = 9010;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 16236,
        shipName: "Gila",
        probability: 45,
        source: "inferred",
        reason: []
      }
    ];
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 99,
        killmail_time: "2026-02-14T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 16236,
          items: [{ item_type_id: 201, flag: 5 }]
        },
        attackers: [],
        zkb: {}
      }
    ];
    const namesByTypeId = new Map<number, string>([[201, "Large Remote Armor Repairer II"]]);

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses,
      characterId,
      namesByTypeId
    });

    expect(rolesByShip.get("Gila")).not.toEqual(expect.arrayContaining(["Armor Logi"]));
    expect(rolesByShip.get("Gila")).not.toEqual(expect.arrayContaining(["Shield Logi"]));
  });

  it("does not infer Armor Logi from capacitor transfer modules alone", () => {
    const characterId = 9012;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 11987,
        shipName: "Basilisk",
        probability: 57,
        source: "inferred",
        reason: []
      }
    ];
    const losses: ZkillKillmail[] = [
      makeLoss({
        killmailId: 6,
        characterId,
        shipTypeId: 11987,
        itemTypeIds: [203]
      })
    ];
    const namesByTypeId = new Map<number, string>([[203, "Medium Remote Capacitor Transmitter II"]]);

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses,
      characterId,
      namesByTypeId
    });

    expect(rolesByShip.get("Basilisk")).not.toEqual(expect.arrayContaining(["Armor Logi"]));
  });

  it("suppresses module-derived long point and armor logi when fit is unknown", () => {
    const characterId = 9013;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 12743,
        shipName: "Viator",
        probability: 63,
        source: "inferred",
        reason: []
      }
    ];
    const losses: ZkillKillmail[] = [
      makeLoss({
        killmailId: 7,
        characterId,
        shipTypeId: 12743,
        itemTypeIds: [3013, 3014]
      })
    ];
    const namesByTypeId = new Map<number, string>([
      [3013, "Warp Disruptor II"],
      [3014, "Large Remote Armor Repairer II"]
    ]);

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses,
      characterId,
      namesByTypeId
    });

    expect(rolesByShip.get("Viator")).not.toEqual(expect.arrayContaining(["Long Point"]));
    expect(rolesByShip.get("Viator")).not.toEqual(expect.arrayContaining(["Armor Logi"]));
  });

  it("keeps hull-only long point on Orthrus even when fit is unknown", () => {
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 33818,
        shipName: "Orthrus",
        probability: 62,
        source: "inferred",
        reason: []
      }
    ];

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses: [],
      characterId: 9014,
      namesByTypeId: new Map()
    });

    expect(rolesByShip.get("Orthrus")).toEqual(expect.arrayContaining(["Long Point"]));
  });

  it("keeps hull-only logistics roles when fit is unknown", () => {
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: 11985,
        shipName: "Guardian",
        probability: 60,
        source: "inferred",
        reason: []
      },
      {
        shipTypeId: 11987,
        shipName: "Basilisk",
        probability: 59,
        source: "inferred",
        reason: []
      }
    ];

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses: [],
      characterId: 9015,
      namesByTypeId: new Map()
    });

    expect(rolesByShip.get("Guardian")).toEqual(expect.arrayContaining(["Armor Logi"]));
    expect(rolesByShip.get("Basilisk")).toEqual(expect.arrayContaining(["Shield Logi"]));
  });

  it("does not pull loss-module role evidence when ship type is unresolved", () => {
    const characterId = 9016;
    const predictedShips: ShipPrediction[] = [
      {
        shipTypeId: undefined,
        shipName: "Viator",
        probability: 100,
        source: "explicit",
        reason: []
      }
    ];
    const losses: ZkillKillmail[] = [
      makeLoss({
        killmailId: 8,
        characterId,
        shipTypeId: 11985,
        itemTypeIds: [3015, 3016]
      })
    ];
    const namesByTypeId = new Map<number, string>([
      [3015, "Warp Disruptor II"],
      [3016, "Large Remote Armor Repairer II"]
    ]);

    const rolesByShip = deriveShipRolePills({
      predictedShips,
      fitCandidates: [],
      losses,
      characterId,
      namesByTypeId
    });

    expect(rolesByShip.get("Viator")).not.toEqual(expect.arrayContaining(["Long Point"]));
    expect(rolesByShip.get("Viator")).not.toEqual(expect.arrayContaining(["Armor Logi"]));
  });
});
