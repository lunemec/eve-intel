import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeDogmaParityNewFitArtifacts } from "../lib/dogma-parity-new-fits/artifacts.mjs";

function createScope(overrides = {}) {
  return {
    runId: "run-42",
    generatedAt: "2026-02-18T13:10:00.000Z",
    source: "manual-flags",
    newFitIds: ["fit-c", "fit-a", "fit-b"],
    ...overrides
  };
}

function createSyncResult(overrides = {}) {
  return {
    scopedFitIds: ["fit-a", "fit-b", "fit-c"],
    scopedFitCount: 3,
    referencesBeforeCount: 1,
    referencesAfterCount: 3,
    added: [{ fitId: "fit-c", source: "pyfa" }],
    skipped: [{ fitId: "fit-a", reason: "already_present" }],
    failed: [
      { fitId: "fit-x", reason: "missing_corpus_entry" },
      { fitId: "fit-b", reason: "pyfa_failed", stage: "timeout", stderrTail: "stderr tail" }
    ],
    pyfaFailureCount: 1,
    missingCorpusFitIds: ["fit-x"],
    mergedReferenceFits: [{ fitId: "fit-a" }, { fitId: "fit-b" }, { fitId: "fit-c" }],
    ...overrides
  };
}

function createCompareResult(overrides = {}) {
  return {
    mode: "sample",
    scopedFitIds: ["fit-a", "fit-b", "fit-c"],
    scopedFitCount: 3,
    comparedFitIds: ["fit-a", "fit-c"],
    comparedFitCount: 2,
    missingCorpusFitIds: ["fit-y"],
    missingReferenceFitIds: ["fit-z"],
    comparisons: [
      { fitId: "fit-a", pass: false, deltas: [{ metric: "alpha", actual: 110, expected: 100, absDelta: 10, relDelta: 0.1, pass: true }] },
      { fitId: "fit-c", pass: false, deltas: [{ metric: "dpsTotal", actual: 200, expected: 100, absDelta: 100, relDelta: 1, pass: false }] }
    ],
    mismatches: [
      {
        fitId: "fit-c",
        expected: { fitId: "fit-c", shipTypeId: 603 },
        deltas: [{ metric: "dpsTotal", actual: 200, expected: 100, absDelta: 100, relDelta: 1, pass: false }]
      },
      {
        fitId: "fit-a",
        expected: { fitId: "fit-a", shipTypeId: 602 },
        deltas: [{ metric: "alpha", actual: 110, expected: 100, absDelta: 10, relDelta: 0.1, pass: true }]
      }
    ],
    failed: [],
    mismatchCount: 2,
    ...overrides
  };
}

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("writeDogmaParityNewFitArtifacts", () => {
  it("writes deterministic report JSON and diagnostics JSONL artifacts", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-new-fit-artifacts-"));
    const reportPath = path.join(tempDir, "reports", "dogma-parity-new-fits-report.json");
    const diagnosticsPath = path.join(tempDir, "reports", "dogma-parity-new-fits-diagnostics.jsonl");

    const result = await writeDogmaParityNewFitArtifacts({
      scope: createScope(),
      syncResult: createSyncResult(),
      compareResult: createCompareResult(),
      exitCode: 1,
      reportPath,
      diagnosticsPath
    });

    const reportFromDisk = JSON.parse(await readFile(reportPath, "utf8"));
    expect(reportFromDisk).toEqual(result.report);
    expect(reportFromDisk).toEqual({
      generatedAt: "2026-02-18T13:10:00.000Z",
      runId: "run-42",
      scopedFitCount: 3,
      comparedFitCount: 2,
      mismatchCount: 2,
      pyfaFailureCount: 1,
      missingCorpusFitIds: ["fit-x", "fit-y"],
      missingReferenceFitIds: ["fit-z"],
      mismatches: [
        {
          fitId: "fit-a",
          shipTypeId: 602,
          deltas: [{ metric: "alpha", actual: 110, expected: 100, absDelta: 10, relDelta: 0.1, pass: true }]
        },
        {
          fitId: "fit-c",
          shipTypeId: 603,
          deltas: [{ metric: "dpsTotal", actual: 200, expected: 100, absDelta: 100, relDelta: 1, pass: false }]
        }
      ],
      pyfaFailures: [
        {
          fitId: "fit-b",
          reason: "pyfa_failed",
          stage: "timeout",
          stderrTail: "stderr tail"
        }
      ],
      exitCode: 1
    });

    const diagnosticsRows = await readJsonl(diagnosticsPath);
    expect(result.diagnosticsEventsWritten).toBe(diagnosticsRows.length);
    expect(diagnosticsRows.slice(0, 3)).toEqual([
      {
        at: "2026-02-18T13:10:00.000Z",
        event: "fit-selected",
        runId: "run-42",
        fitId: "fit-a"
      },
      {
        at: "2026-02-18T13:10:00.000Z",
        event: "fit-selected",
        runId: "run-42",
        fitId: "fit-b"
      },
      {
        at: "2026-02-18T13:10:00.000Z",
        event: "fit-selected",
        runId: "run-42",
        fitId: "fit-c"
      }
    ]);

    expect(new Set(diagnosticsRows.map((row) => row.event))).toEqual(
      new Set([
        "fit-selected",
        "pyfa-run",
        "reference-merged",
        "comparison",
        "mismatch",
        "error"
      ])
    );
  });

  it("writes the required report artifact without diagnostics when omitted", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-new-fit-artifacts-"));
    const reportPath = path.join(tempDir, "reports", "dogma-parity-new-fits-report.json");
    const diagnosticsPath = path.join(tempDir, "reports", "should-not-exist.jsonl");

    const result = await writeDogmaParityNewFitArtifacts({
      scope: createScope(),
      syncResult: createSyncResult({ failed: [], pyfaFailureCount: 0, missingCorpusFitIds: [] }),
      compareResult: createCompareResult({ mismatchCount: 0, mismatches: [], missingCorpusFitIds: [], missingReferenceFitIds: [] }),
      exitCode: 0,
      reportPath
    });

    const reportFromDisk = JSON.parse(await readFile(reportPath, "utf8"));
    expect(reportFromDisk.exitCode).toBe(0);
    expect(result.diagnosticsEventsWritten).toBe(0);
    expect(existsSync(diagnosticsPath)).toBe(false);
  });

  it("emits structured diagnostics errors for compare-stage parse/compute failures", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-new-fit-artifacts-"));
    const reportPath = path.join(tempDir, "reports", "dogma-parity-new-fits-report.json");
    const diagnosticsPath = path.join(tempDir, "reports", "dogma-parity-new-fits-diagnostics.jsonl");

    const result = await writeDogmaParityNewFitArtifacts({
      scope: createScope({ newFitIds: ["fit-a", "fit-b"] }),
      syncResult: createSyncResult({ failed: [], pyfaFailureCount: 0, missingCorpusFitIds: [] }),
      compareResult: createCompareResult({
        missingCorpusFitIds: [],
        missingReferenceFitIds: [],
        comparisons: [{ fitId: "fit-a", pass: true }],
        mismatches: [],
        mismatchCount: 0,
        failed: [
          {
            fitId: "fit-b",
            reason: "dogma_compute_failed",
            error: "eft parse failed",
            stage: "eft_parse",
            stderrTail: "line 3: invalid slot"
          }
        ]
      }),
      exitCode: 0,
      reportPath,
      diagnosticsPath
    });

    const diagnosticsRows = await readJsonl(diagnosticsPath);
    expect(result.diagnosticsEventsWritten).toBe(diagnosticsRows.length);
    expect(diagnosticsRows).toContainEqual({
      at: "2026-02-18T13:10:00.000Z",
      event: "error",
      runId: "run-42",
      fitId: "fit-b",
      reason: "dogma_compute_failed",
      stage: "eft_parse",
      stderrTail: "line 3: invalid slot"
    });
  });
});
