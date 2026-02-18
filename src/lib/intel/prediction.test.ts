import { describe, expect, it } from "vitest";
import { isCapsuleCandidate, isNonShipCandidate, renormalizeProbabilities } from "./prediction";

describe("intel/prediction", () => {
  it("renormalizes prediction probabilities to 100", () => {
    const rows = renormalizeProbabilities([
      {
        shipName: "Ship A",
        probability: 40,
        source: "inferred",
        reason: []
      },
      {
        shipName: "Ship B",
        probability: 10,
        source: "inferred",
        reason: []
      }
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].probability).toBe(80);
    expect(rows[1].probability).toBe(20);
  });

  it("detects capsule and non-ship candidates from ids/names", () => {
    const namesByTypeId = new Map<number, string>([
      [670, "Capsule"],
      [900_001, "Mobile Small Warp Disruptor I"],
      [11188, "Rifter"]
    ]);

    expect(isCapsuleCandidate(670, namesByTypeId)).toBe(true);
    expect(isCapsuleCandidate(11188, namesByTypeId)).toBe(false);
    expect(isNonShipCandidate(900_001, namesByTypeId)).toBe(true);
    expect(isNonShipCandidate(11188, namesByTypeId)).toBe(false);
  });
});
