import { describe, expect, it } from "vitest";
import type { DogmaIndex } from "../dogma/index";
import { deriveFitCandidates, prepareFittedItems, slotFromFlag } from "./fits";

describe("intel/fits", () => {
  it("maps slot flags to fit sections", () => {
    expect(slotFromFlag(27)).toBe("high");
    expect(slotFromFlag(19)).toBe("mid");
    expect(slotFromFlag(11)).toBe("low");
    expect(slotFromFlag(93)).toBe("rig");
    expect(slotFromFlag(5)).toBe("cargo");
    expect(slotFromFlag(undefined)).toBe("other");
  });

  it("drops charge-only duplicate entries when module is present in same slot", () => {
    const names = new Map<number, string>([
      [10631, "Rocket Launcher II"],
      [24473, "Nova Rage Rocket"]
    ]);
    const prepared = prepareFittedItems(
      [
        { item_type_id: 10631, flag: 27 },
        { item_type_id: 24473, flag: 27 }
      ],
      names
    );

    expect(prepared.selected).toHaveLength(1);
    expect(prepared.selected[0].item_type_id).toBe(10631);
    expect(prepared.droppedAsChargeLike).toBe(1);
  });

  it("enriches resolved modules with group/category/effectIds from dogma index", () => {
    const dogmaIndex = buildDogmaIndexFixture([
      {
        typeId: 32780,
        groupId: 1156,
        categoryId: 7,
        effectsById: [13, 4936]
      }
    ]);

    const fits = deriveFitCandidates({
      characterId: 42,
      losses: [
        {
          killmail_id: 9001,
          killmail_time: "2026-02-19T00:00:00Z",
          victim: {
            character_id: 42,
            ship_type_id: 700,
            items: [{ item_type_id: 32780, flag: 19 }]
          },
          attackers: [],
          zkb: {}
        }
      ],
      predictedShips: [
        {
          shipTypeId: 700,
          shipName: "Claymore",
          probability: 100,
          source: "inferred",
          reason: []
        }
      ],
      itemNamesByTypeId: new Map([[32780, "X-Large Ancillary Shield Booster"]]),
      dogmaIndex
    });

    expect(fits).toHaveLength(1);
    const module = fits[0].modulesBySlot?.mid[0];
    expect(module?.groupId).toBe(1156);
    expect(module?.categoryId).toBe(7);
    expect(module?.effectIds).toEqual([13, 4936]);
  });

  it("leaves metadata empty when dogma type is missing", () => {
    const fits = deriveFitCandidates({
      characterId: 42,
      losses: [
        {
          killmail_id: 9002,
          killmail_time: "2026-02-19T00:00:00Z",
          victim: {
            character_id: 42,
            ship_type_id: 700,
            items: [{ item_type_id: 999999, flag: 19 }]
          },
          attackers: [],
          zkb: {}
        }
      ],
      predictedShips: [
        {
          shipTypeId: 700,
          shipName: "Claymore",
          probability: 100,
          source: "inferred",
          reason: []
        }
      ],
      itemNamesByTypeId: new Map([[999999, "Unknown Type"]]),
      dogmaIndex: buildDogmaIndexFixture([])
    });

    expect(fits).toHaveLength(1);
    const module = fits[0].modulesBySlot?.mid[0];
    expect(module?.groupId).toBeUndefined();
    expect(module?.categoryId).toBeUndefined();
    expect(module?.effectIds).toBeUndefined();
  });
});

function buildDogmaIndexFixture(types: Array<{ typeId: number; groupId?: number; categoryId?: number; effectsById?: number[] }>): DogmaIndex {
  return {
    pack: {
      formatVersion: 1,
      source: "test",
      sdeVersion: "test",
      generatedAt: "2026-02-19T00:00:00Z",
      typeCount: types.length,
      types: [],
      groups: [],
      categories: []
    },
    typesById: new Map(
      types.map((type) => [
        type.typeId,
        {
          typeId: type.typeId,
          name: `Type ${type.typeId}`,
          groupId: type.groupId,
          categoryId: type.categoryId,
          attrs: {},
          effects: [],
          effectsById: type.effectsById
        }
      ])
    ),
    typeIdByName: new Map(),
    groupNameById: new Map(),
    categoryNameById: new Map(),
    attributeIdByName: new Map(),
    effectIdByName: new Map()
  };
}
