import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REQUIRED_T3_CRUISER_FITS = 10;
const T3_CRUISER_HULLS = Object.freeze([
  Object.freeze({ shipTypeId: 29990, shipName: "Loki" }),
  Object.freeze({ shipTypeId: 29986, shipName: "Legion" }),
  Object.freeze({ shipTypeId: 29988, shipName: "Proteus" }),
  Object.freeze({ shipTypeId: 29984, shipName: "Tengu" })
]);

describe("dogma parity follow-up cruiser corpus coverage", () => {
  it("keeps at least ten curated corpus+reference fits per T3 cruiser hull", async () => {
    const corpusRows = await readJsonl("data/parity/fit-corpus.jsonl");
    const references = await readJson("data/parity/reference-results.json");
    const referenceByFitId = new Map(
      (Array.isArray(references?.fits) ? references.fits : [])
        .map((row) => [normalizeFitId(row?.fitId), row])
        .filter(([fitId]) => fitId.length > 0)
    );

    for (const hull of T3_CRUISER_HULLS) {
      const corpusForHull = corpusRows.filter((row) => Number(row?.shipTypeId) === hull.shipTypeId);
      expect(corpusForHull.length, `${hull.shipName} corpus fits`).toBeGreaterThanOrEqual(
        REQUIRED_T3_CRUISER_FITS
      );

      const referencedFitCount = corpusForHull.filter((row) =>
        referenceByFitId.has(normalizeFitId(row?.fitId))
      ).length;
      expect(
        referencedFitCount,
        `${hull.shipName} corpus fits with reference rows`
      ).toBeGreaterThanOrEqual(REQUIRED_T3_CRUISER_FITS);
    }
  });

  it("keeps full referenced coverage for every T3 cruiser subsystem variant", async () => {
    const corpusRows = await readJsonl("data/parity/fit-corpus.jsonl");
    const references = await readJson("data/parity/reference-results.json");
    const manifestPath = "public/data/dogma-manifest.json";
    if (!existsSync(manifestPath)) {
      return;
    }

    const manifest = await readJson(manifestPath);
    const packFile = typeof manifest?.packFile === "string" ? manifest.packFile : "";
    const packPath = packFile ? `public/data/${packFile}` : "";
    if (!packPath || !existsSync(packPath)) {
      return;
    }

    const pack = await readJson(packPath);

    const referenceFitIds = new Set(
      (Array.isArray(references?.fits) ? references.fits : [])
        .map((row) => normalizeFitId(row?.fitId))
        .filter(Boolean)
    );
    const subsystemTypes = Array.isArray(pack?.types)
      ? pack.types.filter((type) => Number(type?.categoryId) === 32)
      : [];

    for (const hull of T3_CRUISER_HULLS) {
      const referencedHullFits = corpusRows.filter(
        (row) =>
          Number(row?.shipTypeId) === hull.shipTypeId &&
          referenceFitIds.has(normalizeFitId(row?.fitId))
      );
      const coveredSubsystems = new Set();
      for (const fit of referencedHullFits) {
        for (const subsystemName of extractSubsystemNamesFromEft(fit?.eft, hull.shipName)) {
          coveredSubsystems.add(subsystemName);
        }
      }

      const expectedSubsystems = subsystemTypes
        .map((type) => normalizeSubsystemName(type?.name))
        .filter((name) => name.startsWith(`${hull.shipName} `))
        .sort((left, right) => left.localeCompare(right));
      const missingSubsystems = expectedSubsystems.filter(
        (subsystemName) => !coveredSubsystems.has(subsystemName)
      );

      expect(
        missingSubsystems,
        `${hull.shipName} missing referenced subsystem coverage: ${missingSubsystems.join(", ")}`
      ).toEqual([]);
    }
  });
});

async function readJsonl(filePath) {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function normalizeFitId(fitId) {
  return typeof fitId === "string" ? fitId.trim() : "";
}

function normalizeSubsystemName(name) {
  return typeof name === "string" ? name.trim() : "";
}

function extractSubsystemNamesFromEft(eft, shipName) {
  if (typeof eft !== "string" || typeof shipName !== "string") {
    return [];
  }
  const normalizedShipName = shipName.trim();
  if (!normalizedShipName) {
    return [];
  }
  return eft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) => line.startsWith(`${normalizedShipName} `) && line.includes(" - ")
    );
}
