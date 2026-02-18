import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildDogmaIndex } from "../index";
import { calculateShipCombatMetrics } from "../calc";
import type { DogmaPack } from "../types";
import type { FitCorpusEntry, ParityMetricResult } from "./types";
import { parseEftToResolvedFit } from "./eft";

const FOLLOWUP_REL_MAX = 0.1;
const REQUIRED_PASSING_FITS_PER_HULL = 10;
const DESTROYER_HULLS = Object.freeze([
  Object.freeze({ shipTypeId: 35683, shipName: "Hecate" }),
  Object.freeze({ shipTypeId: 34828, shipName: "Jackdaw" }),
  Object.freeze({ shipTypeId: 34317, shipName: "Confessor" }),
  Object.freeze({ shipTypeId: 34562, shipName: "Svipul" })
]);

type ReferenceResultFile = {
  fits: ParityMetricResult[];
};

describe("dogma parity follow-up destroyer gate", () => {
  it("keeps at least ten passing fits per T3 destroyer hull under strict 10pct surfaced metrics", () => {
    const repoRoot = process.cwd();
    const manifestPath = path.join(repoRoot, "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) {
      return;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(repoRoot, "public", "data", manifest.packFile);
    if (!existsSync(packPath)) {
      return;
    }

    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const corpusPath = path.join(repoRoot, "data", "parity", "fit-corpus.jsonl");
    const referencesPath = path.join(repoRoot, "data", "parity", "reference-results.json");
    const corpus = readJsonl<FitCorpusEntry>(corpusPath);
    const referenceFile = JSON.parse(readFileSync(referencesPath, "utf8")) as ReferenceResultFile;
    const referenceById = new Map(referenceFile.fits.map((row) => [row.fitId, row]));

    for (const hull of DESTROYER_HULLS) {
      const fitsForHull = corpus.filter((row) => Number(row.shipTypeId) === hull.shipTypeId);
      const passingFitIds: string[] = [];
      const failingRows: Array<{ fitId: string; metric: string; relDelta: number }> = [];

      for (const fit of fitsForHull) {
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

        const fitFailures: Array<{ metric: string; relDelta: number }> = [];
        collectFailure(fitFailures, "dpsTotal", expected.dpsTotal, actualMetrics.dpsTotal);
        collectFailure(fitFailures, "alpha", expected.alpha, actualMetrics.alpha);
        collectFailure(fitFailures, "ehp", expected.ehp, actualMetrics.ehp);

        for (const layer of ["shield", "armor", "hull"] as const) {
          for (const damageType of ["em", "therm", "kin", "exp"] as const) {
            collectFailure(
              fitFailures,
              `resists.${layer}.${damageType}`,
              expected.resists[layer][damageType],
              actualMetrics.resists[layer][damageType]
            );
          }
        }

        if (fitFailures.length === 0) {
          passingFitIds.push(fit.fitId);
          continue;
        }

        for (const failure of fitFailures) {
          failingRows.push({
            fitId: fit.fitId,
            metric: failure.metric,
            relDelta: Number(failure.relDelta.toFixed(9))
          });
        }
      }

      expect(
        passingFitIds.length,
        `${hull.shipName} passing fits (${passingFitIds.length}) failures=${JSON.stringify(
          failingRows.slice(0, 20)
        )}`
      ).toBeGreaterThanOrEqual(REQUIRED_PASSING_FITS_PER_HULL);
    }
  });
});

function collectFailure(
  failures: Array<{ metric: string; relDelta: number }>,
  metric: string,
  expected: number,
  actual: number
) {
  const relDelta = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-9);
  if (relDelta > FOLLOWUP_REL_MAX) {
    failures.push({ metric, relDelta });
  }
}

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
