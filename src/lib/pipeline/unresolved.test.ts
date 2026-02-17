import { describe, expect, it } from "vitest";
import { buildUnresolvedPilotError, collectUnresolvedEntries } from "./unresolved";
import type { ParsedPilotInput } from "../../types";

const ENTRY_A: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

const ENTRY_B: ParsedPilotInput = {
  pilotName: "Pilot B",
  sourceLine: "Pilot B",
  parseConfidence: 1,
  shipSource: "inferred"
};

describe("pipeline/unresolved", () => {
  it("collects unresolved entries by lower-cased pilot name key", () => {
    const idMap = new Map<string, number>([["pilot a", 101]]);
    const unresolved = collectUnresolvedEntries([ENTRY_A, ENTRY_B], idMap);
    expect(unresolved).toEqual([ENTRY_B]);
  });

  it("formats unresolved error message with and without id resolve error", () => {
    expect(buildUnresolvedPilotError(null)).toBe("Character not found in ESI.");
    expect(buildUnresolvedPilotError("timeout")).toBe("Character unresolved (ESI IDs error: timeout)");
  });
});
