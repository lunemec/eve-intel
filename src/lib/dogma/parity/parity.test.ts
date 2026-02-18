import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildDogmaIndex } from "../index";
import { calculateShipCombatMetrics } from "../calc";
import type { DogmaPack } from "../types";
import { compareParityResults } from "./compare";
import { CI_THRESHOLDS, PHASE1_THRESHOLDS, type FitCorpusEntry, type ParityComparison, type ParityMetricResult } from "./types";
import { parseEftToResolvedFit } from "./eft";

type ReferenceResultFile = {
  fits: ParityMetricResult[];
};

describe("dogma parity", () => {
  it("compares app metrics against reference corpus and writes JSON report", async () => {
    const repoRoot = process.cwd();
    const manifestPath = path.join(repoRoot, "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { activeVersion: string; packFile: string };
    const packPath = path.join(repoRoot, "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }

    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const corpusPath = path.join(repoRoot, "data", "parity", "fit-corpus.jsonl");
    const referencesPath = path.join(repoRoot, "data", "parity", "reference-results.json");
    const goldenPath = path.join(repoRoot, "data", "parity", "golden-fit-ids.json");
    const corpus = readJsonl<FitCorpusEntry>(corpusPath);
    const references = JSON.parse(readFileSync(referencesPath, "utf8")) as ReferenceResultFile;
    const referenceById = new Map(references.fits.map((fit) => [fit.fitId, fit]));
    const goldenFitIds = existsSync(goldenPath) ? (JSON.parse(readFileSync(goldenPath, "utf8")) as string[]) : [];
    const missingGoldenReferences = goldenFitIds.filter((fitId) => !referenceById.has(fitId));

    const comparisons: ParityComparison[] = [];
    for (const fit of corpus) {
      const expected = referenceById.get(fit.fitId);
      if (!expected) {
        continue;
      }
      const parsed = parseEftToResolvedFit(index, fit.eft);
      const actualMetrics = calculateShipCombatMetrics(index, {
        shipTypeId: parsed.shipTypeId,
        slots: parsed.slots,
        drones: parsed.drones
      });

      const actual: ParityMetricResult = {
        fitId: fit.fitId,
        shipTypeId: parsed.shipTypeId,
        source: "app",
        sdeVersion: manifest.activeVersion,
        dpsTotal: actualMetrics.dpsTotal,
        alpha: actualMetrics.alpha,
        ehp: actualMetrics.ehp,
        resists: actualMetrics.resists
      };

      comparisons.push(
        compareParityResults({
          expected,
          actual,
          thresholds: process.env.DOGMA_PARITY_MODE === "ci" ? CI_THRESHOLDS : PHASE1_THRESHOLDS
        })
      );
    }

    const failures = comparisons.filter((entry) => !entry.pass);

    const reportPath = path.join(repoRoot, "reports", "dogma-parity-report.json");
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: process.env.DOGMA_PARITY_MODE ?? "sample",
          comparedFits: comparisons.length,
          failingFits: failures.length,
          goldenFits: goldenFitIds.length,
          missingGoldenReferences,
          comparisons
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    expect(comparisons.length).toBeGreaterThan(0);
    if (process.env.DOGMA_PARITY_MODE === "ci") {
      expect(missingGoldenReferences).toHaveLength(0);
      expect(failures).toHaveLength(0);
    }
  });
});

function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
