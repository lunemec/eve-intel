import { describe, expect, it } from "vitest";
import { compareDogmaParityForScope } from "../lib/dogma-parity-new-fits/compare.mjs";

function createMetricResult({
  fitId,
  source = "pyfa",
  dpsTotal = 100,
  alpha = 100,
  ehp = 1000
}) {
  return {
    fitId,
    shipTypeId: 123,
    source,
    sdeVersion: "test-sde",
    dpsTotal,
    alpha,
    ehp,
    resists: {
      shield: { em: 0.1, therm: 0.2, kin: 0.3, exp: 0.4 },
      armor: { em: 0.5, therm: 0.6, kin: 0.7, exp: 0.8 },
      hull: { em: 0.33, therm: 0.33, kin: 0.33, exp: 0.33 }
    }
  };
}

function createCorpusEntry(fitId) {
  return {
    fitId,
    shipTypeId: 123,
    eft: `[Ship, ${fitId}]`,
    origin: "zkill",
    tags: ["scope-test"]
  };
}

describe("compareDogmaParityForScope", () => {
  it("compares only scoped fit ids with deterministic ordering", async () => {
    const calledFitIds = [];

    const result = await compareDogmaParityForScope({
      newFitIds: ["fit-b", "fit-a", "fit-b", "fit-c"],
      corpusEntries: [
        createCorpusEntry("fit-c"),
        createCorpusEntry("fit-a"),
        createCorpusEntry("fit-b"),
        createCorpusEntry("fit-not-scoped")
      ],
      referenceFits: [
        createMetricResult({ fitId: "fit-c" }),
        createMetricResult({ fitId: "fit-a" }),
        createMetricResult({ fitId: "fit-b" }),
        createMetricResult({ fitId: "fit-not-scoped" })
      ],
      computeActualForFit: async ({ fitId }) => {
        calledFitIds.push(fitId);
        if (fitId === "fit-b") {
          return createMetricResult({ fitId, source: "app", dpsTotal: 151 });
        }
        return createMetricResult({ fitId, source: "app" });
      }
    });

    expect(result.scopedFitIds).toEqual(["fit-a", "fit-b", "fit-c"]);
    expect(result.comparedFitIds).toEqual(["fit-a", "fit-b", "fit-c"]);
    expect(calledFitIds).toEqual(["fit-a", "fit-b", "fit-c"]);
    expect(result.missingCorpusFitIds).toEqual([]);
    expect(result.missingReferenceFitIds).toEqual([]);
    expect(result.mismatches.map((row) => row.fitId)).toEqual(["fit-b"]);
  });

  it("reports missing corpus and missing references explicitly while continuing", async () => {
    const calledFitIds = [];

    const result = await compareDogmaParityForScope({
      newFitIds: ["fit-missing-ref", "fit-a", "fit-missing-corpus", "fit-missing-ref"],
      corpusEntries: [createCorpusEntry("fit-a"), createCorpusEntry("fit-missing-ref")],
      referenceFits: [createMetricResult({ fitId: "fit-a" })],
      computeActualForFit: async ({ fitId }) => {
        calledFitIds.push(fitId);
        return createMetricResult({ fitId, source: "app" });
      }
    });

    expect(result.scopedFitIds).toEqual(["fit-a", "fit-missing-corpus", "fit-missing-ref"]);
    expect(result.comparedFitIds).toEqual(["fit-a"]);
    expect(calledFitIds).toEqual(["fit-a"]);
    expect(result.missingCorpusFitIds).toEqual(["fit-missing-corpus"]);
    expect(result.missingReferenceFitIds).toEqual(["fit-missing-ref"]);
    expect(result.mismatches).toEqual([]);
  });

  it("records per-fit dogma compute failures and continues comparing remaining fits", async () => {
    const calledFitIds = [];
    const computeError = new Error("eft parse failed");
    computeError.details = {
      stage: "eft_parse",
      stderrTail: "line 3: invalid slot"
    };

    const result = await compareDogmaParityForScope({
      newFitIds: ["fit-c", "fit-b", "fit-a"],
      corpusEntries: [createCorpusEntry("fit-a"), createCorpusEntry("fit-b"), createCorpusEntry("fit-c")],
      referenceFits: [
        createMetricResult({ fitId: "fit-a" }),
        createMetricResult({ fitId: "fit-b" }),
        createMetricResult({ fitId: "fit-c" })
      ],
      computeActualForFit: async ({ fitId }) => {
        calledFitIds.push(fitId);
        if (fitId === "fit-b") {
          throw computeError;
        }
        return createMetricResult({ fitId, source: "app" });
      }
    });

    expect(calledFitIds).toEqual(["fit-a", "fit-b", "fit-c"]);
    expect(result.comparedFitIds).toEqual(["fit-a", "fit-c"]);
    expect(result.mismatches).toEqual([]);
    expect(result.failed).toEqual([
      {
        fitId: "fit-b",
        reason: "dogma_compute_failed",
        error: "eft parse failed",
        stage: "eft_parse",
        stderrTail: "line 3: invalid slot"
      }
    ]);
  });

  it("uses ci thresholds when mode is ci", async () => {
    const params = {
      newFitIds: ["fit-a"],
      corpusEntries: [createCorpusEntry("fit-a")],
      referenceFits: [createMetricResult({ fitId: "fit-a", dpsTotal: 100 })],
      computeActualForFit: async ({ fitId }) =>
        createMetricResult({
          fitId,
          source: "app",
          dpsTotal: 120
        })
    };

    const sampleResult = await compareDogmaParityForScope({
      ...params,
      mode: "sample"
    });
    const ciResult = await compareDogmaParityForScope({
      ...params,
      mode: "ci"
    });

    expect(sampleResult.comparisons[0].pass).toBe(true);
    expect(ciResult.comparisons[0].pass).toBe(false);
  });
});
