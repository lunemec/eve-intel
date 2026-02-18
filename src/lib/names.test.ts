import { describe, expect, it } from "vitest";
import { buildDogmaIndex } from "./dogma/index";
import type { DogmaPack } from "./dogma/types";
import { withDogmaTypeNameFallback } from "./names";

const pack: DogmaPack = {
  formatVersion: 1,
  source: "test",
  sdeVersion: "test",
  generatedAt: "2026-02-16T00:00:00Z",
  typeCount: 2,
  types: [
    { typeId: 11192, groupId: 1, categoryId: 6, name: "Buzzard", attrs: {}, effects: [] },
    { typeId: 3756, groupId: 1, categoryId: 6, name: "Gnosis", attrs: {}, effects: [] }
  ],
  groups: [],
  categories: []
};

describe("withDogmaTypeNameFallback", () => {
  it("backfills unresolved IDs from dogma type names", () => {
    const index = buildDogmaIndex(pack);
    const initial = new Map<number, string>([[12032, "Manticore"]]);
    const ids = [12032, 11192, 3756];

    const result = withDogmaTypeNameFallback(ids, initial, index);

    expect(result.backfilledCount).toBe(2);
    expect(result.namesById.get(12032)).toBe("Manticore");
    expect(result.namesById.get(11192)).toBe("Buzzard");
    expect(result.namesById.get(3756)).toBe("Gnosis");
  });

  it("does not overwrite existing names", () => {
    const index = buildDogmaIndex(pack);
    const initial = new Map<number, string>([[11192, "Custom Name"]]);

    const result = withDogmaTypeNameFallback([11192], initial, index);

    expect(result.backfilledCount).toBe(0);
    expect(result.namesById.get(11192)).toBe("Custom Name");
  });
});

