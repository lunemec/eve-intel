import { describe, expect, it } from "vitest";
import {
  buildFleetGroupingSourceSignature,
  computeFleetGrouping,
  createEmptyFleetGroupingState,
  stableFleetGroupId
} from "./fleetGrouping";

describe("fleetGrouping skeleton", () => {
  it("creates stable empty state payload", () => {
    const state = createEmptyFleetGroupingState({
      generatedAtMs: 123,
      sourceSignature: "signature-v1"
    });

    expect(state).toEqual({
      version: 1,
      groups: [],
      suggestions: [],
      orderedPilotIds: [],
      generatedAtMs: 123,
      sourceSignature: "signature-v1"
    });
  });

  it("normalizes selected ids in source signature", () => {
    expect(buildFleetGroupingSourceSignature([7, 2, 7, 0, -1, Number.NaN, 4])).toBe(
      "fleet-grouping-v1|selected:2,4,7"
    );
    expect(buildFleetGroupingSourceSignature([])).toBe("fleet-grouping-v1|selected:");
  });

  it("creates deterministic group ids independent of member order", () => {
    const first = stableFleetGroupId([300, 100, 200, 100]);
    const second = stableFleetGroupId([200, 300, 100]);

    expect(first).toBe(second);
    expect(first).toMatch(/^fleet-group-v1-[0-9a-f]{8}$/);
  });

  it("returns stable empty output from skeleton compute path", () => {
    const output = computeFleetGrouping({
      selectedPilotIds: [9, 3, 9],
      pilotCardsById: new Map(),
      allKnownPilotNamesById: new Map(),
      nowMs: 456
    });

    expect(output.orderedPilotIds).toEqual([]);
    expect(output.groups).toEqual([]);
    expect(output.suggestions).toEqual([]);
    expect(output.state).toEqual({
      version: 1,
      groups: [],
      suggestions: [],
      orderedPilotIds: [],
      generatedAtMs: 456,
      sourceSignature: "fleet-grouping-v1|selected:3,9"
    });
  });
});
