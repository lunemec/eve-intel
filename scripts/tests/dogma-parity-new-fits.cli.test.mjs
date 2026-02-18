import { describe, expect, it } from "vitest";
import {
  DogmaParityNewFitsCliUsageError,
  runDogmaParityNewFitsCli
} from "../lib/dogma-parity-new-fits/cli.mjs";

function createLineCollector() {
  const lines = [];
  return {
    lines,
    collect(line = "") {
      lines.push(String(line));
    }
  };
}

function createParsedArgs(overrides = {}) {
  return {
    help: false,
    mode: "sample",
    scopeFilePath: undefined,
    fitIdFlags: ["fit-a", "fit-b"],
    runId: undefined,
    generatedAt: undefined,
    source: undefined,
    ...overrides
  };
}

function createScope(overrides = {}) {
  return {
    runId: "run-123",
    generatedAt: "2026-02-18T13:00:00.000Z",
    source: "manual-flags",
    newFitIds: ["fit-a", "fit-b"],
    ...overrides
  };
}

function createSyncResult(overrides = {}) {
  return {
    scopedFitIds: ["fit-a", "fit-b"],
    scopedFitCount: 2,
    referencesBeforeCount: 0,
    referencesAfterCount: 2,
    added: [],
    skipped: [],
    failed: [],
    pyfaFailureCount: 0,
    missingCorpusFitIds: [],
    mergedReferenceFits: [{ fitId: "fit-a" }, { fitId: "fit-b" }],
    ...overrides
  };
}

function createCompareResult(overrides = {}) {
  return {
    mode: "sample",
    scopedFitIds: ["fit-a", "fit-b"],
    scopedFitCount: 2,
    comparedFitIds: ["fit-a", "fit-b"],
    comparedFitCount: 2,
    missingCorpusFitIds: [],
    missingReferenceFitIds: [],
    comparisons: [],
    mismatches: [],
    mismatchCount: 0,
    ...overrides
  };
}

describe("runDogmaParityNewFitsCli", () => {
  it("returns non-zero when scoped mismatches exist", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();
    const artifactCalls = [];

    const exitCode = await runDogmaParityNewFitsCli(["--fit-id", "fit-a"], {
      parseArgsFn: () => createParsedArgs(),
      resolveScopeFn: async () => createScope(),
      readCorpusEntriesFn: async () => [],
      readReferenceResultsFn: async () => ({ fits: [] }),
      readDogmaManifestFn: async () => ({ activeVersion: "sde-test" }),
      syncReferencesFn: async () => createSyncResult(),
      compareScopeFn: async () => createCompareResult({ mismatchCount: 1, mismatches: [{ fitId: "fit-b" }] }),
      writeReferenceResultsFn: async () => {},
      writeArtifactsFn: async (payload) => {
        artifactCalls.push(payload);
      },
      computeActualForFitFn: async () => ({}),
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(1);
    expect(stderr.lines).toEqual([]);
    expect(artifactCalls).toHaveLength(1);
    expect(artifactCalls[0]).toEqual(
      expect.objectContaining({
        scope: createScope(),
        exitCode: 1
      })
    );
    expect(stdout.lines).toEqual([
      "[dogma:parity:new-fits] runId=run-123 scoped=2 compared=2 mismatches=1 pyfaFailures=0"
    ]);
  });

  it("returns zero when scoped fits compare cleanly", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();
    const artifactCalls = [];

    const exitCode = await runDogmaParityNewFitsCli(["--fit-id", "fit-a"], {
      parseArgsFn: () => createParsedArgs(),
      resolveScopeFn: async () => createScope(),
      readCorpusEntriesFn: async () => [],
      readReferenceResultsFn: async () => ({ fits: [] }),
      readDogmaManifestFn: async () => ({ activeVersion: "sde-test" }),
      syncReferencesFn: async () => createSyncResult(),
      compareScopeFn: async () => createCompareResult({ mismatchCount: 0 }),
      writeReferenceResultsFn: async () => {},
      writeArtifactsFn: async (payload) => {
        artifactCalls.push(payload);
      },
      computeActualForFitFn: async () => ({}),
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(0);
    expect(stderr.lines).toEqual([]);
    expect(artifactCalls).toHaveLength(1);
    expect(artifactCalls[0]).toEqual(
      expect.objectContaining({
        scope: createScope(),
        exitCode: 0
      })
    );
    expect(stdout.lines).toEqual([
      "[dogma:parity:new-fits] runId=run-123 scoped=2 compared=2 mismatches=0 pyfaFailures=0"
    ]);
  });

  it("returns 2 and prints usage details for argument errors", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();

    const exitCode = await runDogmaParityNewFitsCli(["--unknown"], {
      parseArgsFn: () => {
        throw new DogmaParityNewFitsCliUsageError("Unknown argument: --unknown");
      },
      formatUsageFn: () => "usage text",
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(2);
    expect(stdout.lines).toEqual([]);
    expect(stderr.lines).toEqual(["Unknown argument: --unknown", "", "usage text"]);
  });

  it("returns 1 and prints fatal summary for runtime failures", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();

    const exitCode = await runDogmaParityNewFitsCli(["--fit-id", "fit-a"], {
      parseArgsFn: () => createParsedArgs(),
      resolveScopeFn: async () => createScope(),
      readCorpusEntriesFn: async () => [],
      readReferenceResultsFn: async () => ({ fits: [] }),
      readDogmaManifestFn: async () => ({ activeVersion: "sde-test" }),
      syncReferencesFn: async () => {
        throw new Error("sync failed");
      },
      compareScopeFn: async () => createCompareResult(),
      writeReferenceResultsFn: async () => {},
      writeArtifactsFn: async () => {},
      computeActualForFitFn: async () => ({}),
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(1);
    expect(stdout.lines).toEqual([]);
    expect(stderr.lines).toEqual(["[dogma:parity:new-fits] fatal: sync failed"]);
  });
});
