import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DogmaParityFollowupBaselineCliUsageError,
  runDogmaParityFollowupBaselineCli
} from "../lib/dogma-parity-followup-baseline/cli.mjs";

const cleanupPaths = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const targetPath = cleanupPaths.pop();
    if (!targetPath) {
      continue;
    }
    const fs = await import("node:fs/promises");
    await fs.rm(targetPath, { recursive: true, force: true });
  }
});

function createLineCollector() {
  const lines = [];
  return {
    lines,
    collect(line = "") {
      lines.push(String(line));
    }
  };
}

describe("runDogmaParityFollowupBaselineCli", () => {
  it("fails entry gate before baseline generation when precondition is unmet", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();
    const baselineCalls = [];

    const exitCode = await runDogmaParityFollowupBaselineCli([], {
      runBaselineFn: async () => {
        baselineCalls.push("called");
      },
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(2);
    expect(stdout.lines).toEqual([]);
    expect(stderr.lines).toEqual([
      "[dogma:parity:followup:baseline] entry gate failed: current Ralph task is not marked completed/merged. Re-run with --precondition-met once the prerequisite task is merged."
    ]);
    expect(baselineCalls).toEqual([]);
  });

  it("runs baseline when precondition flag is provided", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();
    const baselineCalls = [];

    const exitCode = await runDogmaParityFollowupBaselineCli(["--precondition-met"], {
      runBaselineFn: async (parsedArgs) => {
        baselineCalls.push(parsedArgs);
      },
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(0);
    expect(stderr.lines).toEqual([]);
    expect(stdout.lines).toEqual([
      "[dogma:parity:followup:baseline] baseline run complete."
    ]);
    expect(baselineCalls).toEqual([
      {
        parityReportPath: path.join("reports", "dogma-parity-report.json"),
        summaryPath: path.join(
          "reports",
          "dogma-parity-followup-baseline-summary.json"
        )
      }
    ]);
  });

  it("runs default baseline pipeline and writes summary artifact", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-followup-baseline-cli-"));
    cleanupPaths.push(tempDir);

    const parityReportPath = path.join(tempDir, "dogma-parity-report.json");
    const summaryPath = path.join(tempDir, "followup-summary.json");
    await writeFile(
      parityReportPath,
      `${JSON.stringify(
        {
          generatedAt: "2026-02-18T14:20:00.000Z",
          comparisons: [
            {
              fitId: "fit-a",
              expected: { shipTypeId: 29990 },
              deltas: [{ metric: "dpsTotal", absDelta: 7, relDelta: 0.07 }]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const stdout = createLineCollector();
    const stderr = createLineCollector();
    const exitCode = await runDogmaParityFollowupBaselineCli(
      [
        "--precondition-met",
        "--parity-report-path",
        parityReportPath,
        "--summary-path",
        summaryPath
      ],
      {
        stdout: stdout.collect,
        stderr: stderr.collect
      }
    );

    expect(exitCode).toBe(0);
    expect(stderr.lines).toEqual([]);
    expect(stdout.lines).toEqual([
      "[dogma:parity:followup:baseline] baseline run complete."
    ]);

    const summary = JSON.parse(await readFile(summaryPath, "utf8"));
    expect(summary.thresholdPolicy).toEqual({
      mode: "followup-10pct",
      relMax: 0.1
    });
    expect(summary.comparedFits).toBe(1);
    expect(summary.failingFits).toBe(0);
  });

  it("returns usage error output for invalid arguments", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();

    const exitCode = await runDogmaParityFollowupBaselineCli(["--unknown"], {
      parseArgsFn: () => {
        throw new DogmaParityFollowupBaselineCliUsageError("Unknown argument: --unknown");
      },
      formatUsageFn: () => "usage text",
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(2);
    expect(stdout.lines).toEqual([]);
    expect(stderr.lines).toEqual(["Unknown argument: --unknown", "", "usage text"]);
  });
});
