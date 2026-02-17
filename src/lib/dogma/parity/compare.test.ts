import { describe, expect, it } from "vitest";
import { compareParityResults } from "./compare";
import { PHASE1_THRESHOLDS, type ParityMetricResult } from "./types";

const expected: ParityMetricResult = {
  fitId: "fit-a",
  shipTypeId: 1,
  source: "pyfa",
  sdeVersion: "test",
  dpsTotal: 400,
  alpha: 600,
  ehp: 9500,
  resists: {
    shield: { em: 0.1, therm: 0.2, kin: 0.3, exp: 0.4 },
    armor: { em: 0.7, therm: 0.8, kin: 0.75, exp: 0.82 },
    hull: { em: 0.6, therm: 0.6, kin: 0.6, exp: 0.6 }
  }
};

describe("compareParityResults", () => {
  it("passes when scalar and resist deltas are inside threshold", () => {
    const actual: ParityMetricResult = {
      ...expected,
      source: "app",
      dpsTotal: 410,
      alpha: 610,
      ehp: 9800,
      resists: {
        ...expected.resists,
        armor: { ...expected.resists.armor, kin: 0.78 }
      }
    };

    const compared = compareParityResults({ expected, actual, thresholds: PHASE1_THRESHOLDS });
    expect(compared.pass).toBe(true);
  });

  it("fails when scalar delta exceeds max(abs, rel)", () => {
    const actual: ParityMetricResult = {
      ...expected,
      source: "app",
      dpsTotal: 480
    };

    const compared = compareParityResults({ expected, actual, thresholds: PHASE1_THRESHOLDS });
    expect(compared.pass).toBe(false);
    expect(compared.deltas.find((d) => d.metric === "dpsTotal")?.pass).toBe(false);
  });
});
