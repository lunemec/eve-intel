import { describe, expect, it } from "vitest";
import { buildResolvedPilotTasks } from "./tasking";
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

describe("pipeline/tasking", () => {
  it("maps entries to only those with resolved ids", () => {
    const tasks = buildResolvedPilotTasks([ENTRY_A, ENTRY_B], new Map([["pilot b", 202]]));
    expect(tasks).toEqual([{ entry: ENTRY_B, characterId: 202 }]);
  });
});
