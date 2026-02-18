import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildDogmaIndex } from "../index";
import { calculateShipCombatMetrics } from "../calc";
import type { DogmaPack } from "../types";
import type { FitCorpusEntry, ParityMetricResult } from "./types";
import { parseEftToResolvedFit } from "./eft";

const FOLLOWUP_REL_MAX = 0.1;
const FOLLOWUP_CRUISER_REGRESSION_FIT_IDS = [
  "zkill-legion-133446555",
  "zkill-legion-133466849",
  "zkill-legion-133466796",
  "zkill-loki-133468890",
  "zkill-proteus-133464801",
  "zkill-proteus-133464925",
  "zkill-proteus-133468027",
  "zkill-proteus-133467601",
  "zkill-tengu-133463746",
  "zkill-tengu-133469643"
];

type ReferenceResultFile = {
  fits: ParityMetricResult[];
};

describe("dogma parity follow-up cruiser regressions", () => {
  it("keeps targeted cruiser regressions within strict 10pct surfaced-metric deltas", () => {
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
    const corpusById = new Map(corpus.map((row) => [row.fitId, row]));
    const referenceById = new Map(referenceFile.fits.map((row) => [row.fitId, row]));

    const failures: Array<{
      fitId: string;
      metric: string;
      expected: number;
      actual: number;
      relDelta: number;
    }> = [];

    for (const fitId of FOLLOWUP_CRUISER_REGRESSION_FIT_IDS) {
      const fit = corpusById.get(fitId);
      const expected = referenceById.get(fitId);
      expect(fit).toBeDefined();
      expect(expected).toBeDefined();
      if (!fit || !expected) {
        continue;
      }

      const parsed = parseEftToResolvedFit(index, fit.eft);
      const actualMetrics = calculateShipCombatMetrics(index, {
        shipTypeId: parsed.shipTypeId,
        slots: parsed.slots,
        drones: parsed.drones
      });

      collectFailure(failures, fitId, "dpsTotal", expected.dpsTotal, actualMetrics.dpsTotal);
      collectFailure(failures, fitId, "alpha", expected.alpha, actualMetrics.alpha);
      collectFailure(failures, fitId, "ehp", expected.ehp, actualMetrics.ehp);

      for (const layer of ["shield", "armor", "hull"] as const) {
        for (const damageType of ["em", "therm", "kin", "exp"] as const) {
          collectFailure(
            failures,
            fitId,
            `resists.${layer}.${damageType}`,
            expected.resists[layer][damageType],
            actualMetrics.resists[layer][damageType]
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

function collectFailure(
  failures: Array<{ fitId: string; metric: string; expected: number; actual: number; relDelta: number }>,
  fitId: string,
  metric: string,
  expected: number,
  actual: number
) {
  const relDelta = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-9);
  if (relDelta > FOLLOWUP_REL_MAX) {
    failures.push({
      fitId,
      metric,
      expected,
      actual,
      relDelta: Number(relDelta.toFixed(9))
    });
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
