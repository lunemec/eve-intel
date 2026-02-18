import { describe, expect, it } from "vitest";
import { prepareFittedItems, slotFromFlag } from "./fits";

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
});
