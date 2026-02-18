import { describe, expect, it } from "vitest";
import { syncDogmaParityReferencesForScope } from "../lib/dogma-parity-new-fits/sync.mjs";

function createResists() {
  return {
    shield: { em: 0.1, therm: 0.2, kin: 0.3, exp: 0.4 },
    armor: { em: 0.5, therm: 0.6, kin: 0.7, exp: 0.8 },
    hull: { em: 0.33, therm: 0.33, kin: 0.33, exp: 0.33 }
  };
}

function createCorpusEntry(fitId, shipTypeId = 123) {
  return {
    fitId,
    shipTypeId,
    eft: `[Ship, ${fitId}]\nModule A`,
    origin: "zkill",
    tags: ["new-fit", "scope"]
  };
}

function createReferenceFit(fitId, shipTypeId = 123) {
  return {
    fitId,
    shipTypeId,
    source: "pyfa",
    sdeVersion: "existing",
    dpsTotal: 1,
    alpha: 2,
    ehp: 3,
    resists: createResists(),
    metadata: {
      referenceMethod: "pyfa-manual"
    }
  };
}

function createPyfaResult({
  fitId,
  shipTypeId = 123,
  dpsTotal = 100,
  alpha = 120,
  ehp = 2000
}) {
  return {
    fitId,
    shipTypeId,
    source: "pyfa",
    sdeVersion: "ignored",
    dpsTotal,
    alpha,
    ehp,
    resists: createResists(),
    metadata: {
      runner: "stub-runner"
    }
  };
}

describe("syncDogmaParityReferencesForScope", () => {
  it("processes only scoped fit ids and merges references deterministically", async () => {
    const calledFitIds = [];

    const result = await syncDogmaParityReferencesForScope(
      {
        newFitIds: ["fit-c", "fit-a", "fit-b", "fit-c", "fit-missing-corpus"],
        corpusEntries: [
          createCorpusEntry("fit-c", 111),
          createCorpusEntry("fit-a", 112),
          createCorpusEntry("fit-b", 113),
          createCorpusEntry("fit-not-scoped", 114)
        ],
        referenceFits: [createReferenceFit("fit-z", 999), createReferenceFit("fit-a", 112)],
        sdeVersion: "test-sde"
      },
      {
        runPyfaForFit: async ({ fitId, shipTypeId }) => {
          calledFitIds.push(fitId);
          if (fitId === "fit-b") {
            return createPyfaResult({
              fitId,
              shipTypeId,
              dpsTotal: 1.23456,
              alpha: 2.34567,
              ehp: 3.45678
            });
          }
          return createPyfaResult({
            fitId,
            shipTypeId,
            dpsTotal: 9.87654,
            alpha: 8.76543,
            ehp: 7.65432
          });
        }
      }
    );

    expect(result.scopedFitIds).toEqual(["fit-a", "fit-b", "fit-c", "fit-missing-corpus"]);
    expect(result.added.map((row) => row.fitId)).toEqual(["fit-b", "fit-c"]);
    expect(result.skipped).toEqual([{ fitId: "fit-a", reason: "already_present" }]);
    expect(result.failed).toEqual([
      { fitId: "fit-missing-corpus", reason: "missing_corpus_entry" }
    ]);
    expect(calledFitIds).toEqual(["fit-b", "fit-c"]);
    expect(result.mergedReferenceFits.map((fit) => fit.fitId)).toEqual([
      "fit-a",
      "fit-b",
      "fit-c",
      "fit-z"
    ]);

    expect(result.mergedReferenceFits.find((fit) => fit.fitId === "fit-b")).toEqual(
      expect.objectContaining({
        fitId: "fit-b",
        shipTypeId: 113,
        source: "pyfa",
        sdeVersion: "test-sde",
        dpsTotal: 1.2346,
        alpha: 2.3457,
        ehp: 3.4568,
        metadata: expect.objectContaining({
          referenceMethod: "pyfa-auto",
          origin: "zkill",
          tags: "new-fit,scope",
          runner: "stub-runner"
        })
      })
    );
  });

  it("records pyfa failures and continues with remaining scoped fits", async () => {
    const pyfaError = new Error("pyfa runtime failed");
    pyfaError.details = {
      runner: "local-python",
      pythonBin: "python3",
      timeoutMs: 321,
      hardKillMs: 654,
      stage: "timeout",
      elapsedMs: 111,
      stdoutTail: "stdout tail",
      stderrTail: "stderr tail",
      normalizedEftHash: "hash-from-error"
    };

    const calledFitIds = [];
    const result = await syncDogmaParityReferencesForScope(
      {
        newFitIds: ["fit-b", "fit-a"],
        corpusEntries: [createCorpusEntry("fit-a", 111), createCorpusEntry("fit-b", 222)],
        referenceFits: [],
        sdeVersion: "test-sde"
      },
      {
        runPyfaForFit: async ({ fitId, shipTypeId }) => {
          calledFitIds.push(fitId);
          if (fitId === "fit-a") {
            throw pyfaError;
          }
          return createPyfaResult({ fitId, shipTypeId });
        }
      }
    );

    expect(calledFitIds).toEqual(["fit-a", "fit-b"]);
    expect(result.added).toEqual([{ fitId: "fit-b", source: "pyfa" }]);
    expect(result.failed).toEqual([
      {
        fitId: "fit-a",
        reason: "pyfa_failed",
        error: "pyfa runtime failed",
        runner: "local-python",
        pythonBin: "python3",
        timeoutMs: 321,
        hardKillMs: 654,
        stage: "timeout",
        elapsedMs: 111,
        stdoutTail: "stdout tail",
        stderrTail: "stderr tail",
        normalizedEftHash: "hash-from-error"
      }
    ]);
    expect(result.mergedReferenceFits.map((fit) => fit.fitId)).toEqual(["fit-b"]);
  });
});
