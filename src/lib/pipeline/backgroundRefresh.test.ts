import { describe, expect, it } from "vitest";
import type { ParsedPilotInput } from "../../types";
import { collectBackgroundRefreshCandidates } from "./backgroundRefresh";

const ENTRY_A: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

const ENTRY_A_DUPLICATE: ParsedPilotInput = {
  pilotName: "  pilot a  ",
  sourceLine: "pilot a",
  parseConfidence: 1,
  shipSource: "inferred"
};

const ENTRY_B: ParsedPilotInput = {
  pilotName: "Pilot B",
  sourceLine: "Pilot B",
  parseConfidence: 1,
  shipSource: "inferred"
};

describe("collectBackgroundRefreshCandidates", () => {
  it("dedupes duplicate pilot keys in a single sweep", () => {
    const candidates = collectBackgroundRefreshCandidates({
      entries: [ENTRY_A, ENTRY_A_DUPLICATE, ENTRY_B],
      isPilotRunActive: () => false,
      refreshInFlightByPilotKey: new Set(),
      characterIdByPilotKey: new Map([
        ["pilot a", 9001],
        ["pilot b", 9002]
      ]),
      forceRefreshByPilotKey: new Set(["pilot a"])
    });

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.pilotKey)).toEqual(["pilot a", "pilot b"]);
    expect(candidates[0]).toMatchObject({
      entry: ENTRY_A,
      pilotKey: "pilot a",
      characterId: 9001,
      forceNetwork: true
    });
  });
});
