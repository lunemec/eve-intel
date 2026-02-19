import { describe, expect, it } from "vitest";
import { classifyTankByModuleMetadata, type TankClassifierModuleInput } from "./classifier";

function module(partial: Partial<TankClassifierModuleInput>): TankClassifierModuleInput {
  return {
    typeId: partial.typeId,
    groupId: partial.groupId,
    categoryId: partial.categoryId,
    effectIds: partial.effectIds ?? []
  };
}

describe("tank/classifier", () => {
  it("classifies shield local tank by typeId/effectId", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 32780, groupId: 1156, categoryId: 7, effectIds: [13, 16, 4936] })
    ]);

    expect(result.tankType).toBe("shield");
    expect(result.scores.shield).toBeGreaterThanOrEqual(4);
  });

  it("classifies armor local tank by typeId/effectId", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 33101, groupId: 1199, categoryId: 7, effectIds: [11, 16, 5275] })
    ]);

    expect(result.tankType).toBe("armor");
    expect(result.scores.armor).toBeGreaterThanOrEqual(4);
  });

  it("classifies hull local tank by typeId/effectId", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 2355, groupId: 63, categoryId: 7, effectIds: [13, 16, 26] })
    ]);

    expect(result.tankType).toBe("hull");
    expect(result.scores.hull).toBeGreaterThanOrEqual(4);
  });

  it("classifies tank rigs by group/effect identity", () => {
    const shield = classifyTankByModuleMetadata([
      module({ typeId: 31790, groupId: 774, categoryId: 7, effectIds: [446, 2663] })
    ]);
    const armor = classifyTankByModuleMetadata([
      module({ typeId: 31055, groupId: 773, categoryId: 7, effectIds: [271, 2663] })
    ]);
    const hull = classifyTankByModuleMetadata([
      module({ typeId: 33890, groupId: 773, categoryId: 7, effectIds: [392, 2663] })
    ]);

    expect(shield.tankType).toBe("shield");
    expect(armor.tankType).toBe("armor");
    expect(hull.tankType).toBe("hull");
  });

  it("keeps ambiguous low-signal modules unresolved", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 2281, groupId: 77, categoryId: 7, effectIds: [5230] }),
      module({ typeId: 11642, groupId: 328, categoryId: 7, effectIds: [2041] })
    ]);

    expect(result.tankType).toBeNull();
    expect(result.scores.shield).toBeGreaterThan(0);
    expect(result.scores.armor).toBeGreaterThan(0);
    expect(result.scores.hull).toBe(0);
  });

  it("keeps curated tank typeId fixtures classified as expected", () => {
    const fixtures: Array<{
      module: TankClassifierModuleInput;
      expected: "shield" | "armor" | "hull";
    }> = [
      {
        module: module({ typeId: 32780, groupId: 1156, categoryId: 7, effectIds: [4936] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 33101, groupId: 1199, categoryId: 7, effectIds: [5275] }),
        expected: "armor"
      },
      {
        module: module({ typeId: 2355, groupId: 63, categoryId: 7, effectIds: [26] }),
        expected: "hull"
      },
      {
        module: module({ typeId: 31790, groupId: 774, categoryId: 7, effectIds: [446, 2663] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 31055, groupId: 773, categoryId: 7, effectIds: [271, 2663] }),
        expected: "armor"
      },
      {
        module: module({ typeId: 33890, groupId: 773, categoryId: 7, effectIds: [392, 2663] }),
        expected: "hull"
      },
      {
        module: module({ typeId: 31724, groupId: 774, categoryId: 7, effectIds: [2663, 2716, 2795] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 31812, groupId: 774, categoryId: 7, effectIds: [486, 2663, 2716] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 31822, groupId: 774, categoryId: 7, effectIds: [2663, 2716, 4967] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 3530, groupId: 62, categoryId: 7, effectIds: [11, 16, 27, 3200] }),
        expected: "armor"
      },
      {
        module: module({ typeId: 20353, groupId: 329, categoryId: 7, effectIds: [11, 16, 1959, 2837] }),
        expected: "armor"
      },
      {
        module: module({ typeId: 31015, groupId: 773, categoryId: 7, effectIds: [2663, 2717, 2792] }),
        expected: "armor"
      },
      {
        module: module({ typeId: 1335, groupId: 78, categoryId: 7, effectIds: [11, 16, 59, 60, 657] }),
        expected: "hull"
      },
      {
        module: module({ typeId: 1333, groupId: 78, categoryId: 7, effectIds: [11, 16, 59, 60, 657] }),
        expected: "hull"
      },
      {
        module: module({ typeId: 34485, groupId: 78, categoryId: 7, effectIds: [11, 16, 59, 60, 657] }),
        expected: "hull"
      },
      {
        module: module({ typeId: 34487, groupId: 78, categoryId: 7, effectIds: [11, 16, 59, 60, 657] }),
        expected: "hull"
      },
      {
        module: module({ typeId: 5647, groupId: 78, categoryId: 7, effectIds: [11, 16, 59, 60, 657] }),
        expected: "hull"
      },
      {
        module: module({ typeId: 5649, groupId: 78, categoryId: 7, effectIds: [11, 16, 59, 60, 657] }),
        expected: "hull"
      },
      {
        module: module({ typeId: 10858, groupId: 40, categoryId: 7, effectIds: [4, 13, 16, 3201] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 3831, groupId: 38, categoryId: 7, effectIds: [4, 13, 16] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 3841, groupId: 38, categoryId: 7, effectIds: [4, 13, 16] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 8517, groupId: 38, categoryId: 7, effectIds: [4, 13, 16] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 1422, groupId: 57, categoryId: 7, effectIds: [11, 16, 51, 5461] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 37820, groupId: 57, categoryId: 7, effectIds: [11, 16, 51, 5461] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 24443, groupId: 338, categoryId: 7, effectIds: [13, 16, 1720, 3061] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 14047, groupId: 338, categoryId: 7, effectIds: [13, 16, 1720, 3061] }),
        expected: "shield"
      },
      {
        module: module({ typeId: 19297, groupId: 338, categoryId: 7, effectIds: [13, 16, 1720, 3061] }),
        expected: "shield"
      }
    ];

    for (const fixture of fixtures) {
      const result = classifyTankByModuleMetadata([fixture.module]);
      expect(result.tankType, String(fixture.module.typeId)).toBe(fixture.expected);
    }
  });

  it("counts shield resistance amplifiers as minor shield signals without forcing classification", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 1808, groupId: 295, categoryId: 7, effectIds: [13, 16, 21, 2052] }),
      module({ typeId: 2537, groupId: 295, categoryId: 7, effectIds: [13, 16, 21, 2052] })
    ]);

    expect(result.tankType).toBeNull();
    expect(result.scores.shield).toBe(2);
    expect(result.scores.armor).toBe(0);
    expect(result.scores.hull).toBe(0);
  });

  it("surfaces unknown tank-like modules for drift review without auto-classifying", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 777001, groupId: 1156, categoryId: 7, effectIds: [16] })
    ]);

    expect(result.tankType).toBeNull();
    expect(result.unclassifiedTankLikeModules.map((entry) => entry.typeId)).toContain(777001);
  });

  it("does not auto-classify remote shield booster modules as local shield tank", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 3608, groupId: 41, categoryId: 7, effectIds: [12, 16, 3201, 6186] })
    ]);

    expect(result.tankType).toBeNull();
  });

  it("does not auto-classify medium remote shield booster modules as local shield tank", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 3598, groupId: 41, categoryId: 7, effectIds: [12, 16, 3201, 6186, 6953] })
    ]);

    expect(result.tankType).toBeNull();
  });

  it("does not auto-classify capital remote shield booster modules as local shield tank", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 3616, groupId: 41, categoryId: 7, effectIds: [12, 16, 3201, 6186] })
    ]);

    expect(result.tankType).toBeNull();
  });

  it("does not auto-classify small remote shield booster modules as local shield tank", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 3588, groupId: 41, categoryId: 7, effectIds: [12, 16, 3201, 6186] })
    ]);

    expect(result.tankType).toBeNull();
  });

  it("does not auto-classify small remote shield booster i modules as local shield tank", () => {
    const result = classifyTankByModuleMetadata([
      module({ typeId: 3586, groupId: 41, categoryId: 7, effectIds: [12, 16, 3201, 6186] })
    ]);

    expect(result.tankType).toBeNull();
  });
});
