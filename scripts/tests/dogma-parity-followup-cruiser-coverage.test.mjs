import { readFile } from "node:fs/promises";
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
