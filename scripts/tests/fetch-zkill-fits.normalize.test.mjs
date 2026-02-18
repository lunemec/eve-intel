import { describe, expect, it } from "vitest";
import { normalizeZkillFittedItems } from "../lib/zkill-fit-fetch-cli/normalize.mjs";

describe("normalizeZkillFittedItems", () => {
  it("includes both destroyed and dropped fitted modules in normalized slot totals", () => {
    const normalized = normalizeZkillFittedItems({
      shipTypeId: 29984,
      items: [
        { item_type_id: 1001, flag: 27, quantity_destroyed: 1 },
        { item_type_id: 1001, flag: 28, quantity_dropped: 1 },
        { item_type_id: 2001, flag: 19, quantity_dropped: 1 },
        { item_type_id: 3001, flag: 11, quantity_destroyed: 2 },
        { item_type_id: 4001, flag: 93, quantity_dropped: 1 },
        { item_type_id: 5001, flag: 125, quantity_destroyed: 1 },
        { item_type_id: 9001, flag: 5, quantity_dropped: 12 },
        { item_type_id: 9002, flag: 87, quantity_destroyed: 3 }
      ]
    });

    expect(normalized.shipTypeId).toBe(29984);
    expect(normalized.slots).toEqual({
      high: [{ typeId: 1001, quantity: 2 }],
      mid: [{ typeId: 2001, quantity: 1 }],
      low: [{ typeId: 3001, quantity: 2 }],
      rig: [{ typeId: 4001, quantity: 1 }],
      subsystem: [{ typeId: 5001, quantity: 1 }],
      otherFitted: []
    });
  });

  it("skips malformed rows and defaults quantity to 1 when both drop/destroy values are missing", () => {
    const normalized = normalizeZkillFittedItems({
      shipTypeId: 17726,
      items: [
        { item_type_id: 12001, flag: 27 },
        { item_type_id: "12002", flag: 27, quantity_destroyed: 1 },
        { item_type_id: 12003, flag: "27", quantity_destroyed: 1 },
        { item_type_id: 12004, flag: 0, quantity_dropped: 2 },
        { item_type_id: 12005, quantity_dropped: 3 },
        null,
        { not_an_item: true }
      ]
    });

    expect(normalized.slots.high).toEqual([{ typeId: 12001, quantity: 1 }]);
    expect(normalized.slots.mid).toEqual([]);
    expect(normalized.slots.low).toEqual([]);
    expect(normalized.slots.rig).toEqual([]);
    expect(normalized.slots.subsystem).toEqual([]);
    expect(normalized.slots.otherFitted).toEqual([]);
  });
});
