import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FOLLOWUP_10PCT_THRESHOLD_POLICY,
  buildDogmaParityFollowupBaselineSummary,
  runDogmaParityFollowupBaseline
} from "../lib/dogma-parity-followup-baseline/baseline.mjs";

const cleanupPaths = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (!target) {
      continue;
    }
    await cleanupPath(target);
  }
});

describe("buildDogmaParityFollowupBaselineSummary", () => {
  it("builds deterministic 10pct summary with per-fit and per-hull rollups", () => {
    const summary = buildDogmaParityFollowupBaselineSummary({
      parityReport: {
        generatedAt: "2026-02-18T14:10:00.000Z",
        comparisons: [
          {
            fitId: "fit-b",
            expected: { shipTypeId: 29990 },
            deltas: [
              {
                metric: "dpsTotal",
                absDelta: 12,
                relDelta: 0.12
              },
              {
                metric: "capacitor.stability",
                absDelta: 100,
                relDelta: 0.8
              }
            ]
          },
          {
            fitId: "fit-a",
            expected: { shipTypeId: 29990 },
            deltas: [
              {
                metric: "dpsTotal",
                absDelta: 8,
                relDelta: 0.08
              },
              {
                metric: "alpha",
                absDelta: 5,
                relDelta: 0.05
              }
            ]
          },
          {
            fitId: "fit-c",
            expected: { shipTypeId: 35683 },
            deltas: [
              {
                metric: "ehp",
                absDelta: 10,
                relDelta: 0.1
              },
              {
                metric: "application.turret",
                absDelta: 50,
                relDelta: 0.5
              }
            ]
          }
        ]
      }
    });

    expect(summary.generatedAt).toBe("2026-02-18T14:10:00.000Z");
    expect(summary.thresholdPolicy).toEqual(FOLLOWUP_10PCT_THRESHOLD_POLICY);
    expect(summary.comparedFits).toBe(3);
    expect(summary.failingFits).toBe(1);
    expect(summary.passingFits).toBe(2);

    expect(summary.perFit).toEqual([
      {
        fitId: "fit-a",
        shipTypeId: 29990,
        pass: true,
        maxRelDelta: 0.08,
        failingMetrics: []
      },
      {
        fitId: "fit-b",
        shipTypeId: 29990,
        pass: false,
        maxRelDelta: 0.12,
        failingMetrics: [
          {
            metric: "dpsTotal",
            absDelta: 12,
            relDelta: 0.12
          }
        ]
      },
      {
        fitId: "fit-c",
        shipTypeId: 35683,
        pass: true,
        maxRelDelta: 0.1,
        failingMetrics: []
      }
    ]);

    expect(summary.perHull).toEqual([
      {
        shipTypeId: 29990,
        comparedFits: 2,
        passingFits: 1,
        failingFits: 1,
        requiredFits: 10,
        deficit: 9
      },
      {
        shipTypeId: 35683,
        comparedFits: 1,
        passingFits: 1,
        failingFits: 0,
        requiredFits: 10,
        deficit: 9
      }
    ]);

    expect(summary.topMismatches).toEqual([
      {
        fitId: "fit-b",
        shipTypeId: 29990,
        metric: "dpsTotal",
        absDelta: 12,
        relDelta: 0.12
      }
    ]);
  });
});

describe("runDogmaParityFollowupBaseline", () => {
  it("writes deterministic follow-up summary artifact", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-followup-baseline-"));
    cleanupPaths.push(tempDir);

    const parityReportPath = path.join(tempDir, "dogma-parity-report.json");
    const summaryPath = path.join(tempDir, "dogma-parity-followup-baseline-summary.json");

    await writeFile(
      parityReportPath,
      `${JSON.stringify(
        {
          generatedAt: "2026-02-18T14:10:00.000Z",
          comparisons: [
            {
              fitId: "fit-z",
              expected: { shipTypeId: 29984 },
              deltas: [{ metric: "dpsTotal", absDelta: 3, relDelta: 0.03 }]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = await runDogmaParityFollowupBaseline({
      parityReportPath,
      summaryPath
    });

    expect(result.summaryPath).toBe(summaryPath);
    expect(result.summary.thresholdPolicy).toEqual(FOLLOWUP_10PCT_THRESHOLD_POLICY);
    expect(result.summary.comparedFits).toBe(1);
    expect(result.summary.failingFits).toBe(0);

    const written = JSON.parse(await readFile(summaryPath, "utf8"));
    expect(written).toEqual(result.summary);
  });
});

async function cleanupPath(targetPath) {
  const fs = await import("node:fs/promises");
  await fs.rm(targetPath, { recursive: true, force: true });
}
