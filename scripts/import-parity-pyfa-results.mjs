#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const referencesPath = path.join(repoRoot, "data", "parity", "reference-results.json");
const manifestPath = path.join(repoRoot, "public", "data", "dogma-manifest.json");
const inputPath = process.argv[2] ?? path.join(repoRoot, "data", "parity", "pyfa-results.json");

function main() {
  if (!existsSync(inputPath)) {
    throw new Error(`Missing pyfa results file: ${inputPath}`);
  }

  const sdeVersion = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8")).activeVersion
    : "unknown";

  const refs = existsSync(referencesPath) ? JSON.parse(readFileSync(referencesPath, "utf8")) : { fits: [] };
  const byFitId = new Map((refs.fits ?? []).map((fit) => [fit.fitId, fit]));

  const payload = JSON.parse(readFileSync(inputPath, "utf8"));
  const incoming = payload.fits ?? payload;
  if (!Array.isArray(incoming)) {
    throw new Error("Invalid pyfa results payload: expected array or { fits: [] }");
  }

  let merged = 0;
  for (const row of incoming) {
    if (!row?.fitId || !row?.shipTypeId) {
      continue;
    }
    byFitId.set(row.fitId, {
      fitId: row.fitId,
      shipTypeId: Number(row.shipTypeId),
      source: "pyfa",
      sdeVersion,
      dpsTotal: Number(row.dpsTotal ?? 0),
      alpha: Number(row.alpha ?? 0),
      ehp: Number(row.ehp ?? 0),
      resists: {
        shield: {
          em: Number(row.resists?.shield?.em ?? 0),
          therm: Number(row.resists?.shield?.therm ?? 0),
          kin: Number(row.resists?.shield?.kin ?? 0),
          exp: Number(row.resists?.shield?.exp ?? 0)
        },
        armor: {
          em: Number(row.resists?.armor?.em ?? 0),
          therm: Number(row.resists?.armor?.therm ?? 0),
          kin: Number(row.resists?.armor?.kin ?? 0),
          exp: Number(row.resists?.armor?.exp ?? 0)
        },
        hull: {
          em: Number(row.resists?.hull?.em ?? 0),
          therm: Number(row.resists?.hull?.therm ?? 0),
          kin: Number(row.resists?.hull?.kin ?? 0),
          exp: Number(row.resists?.hull?.exp ?? 0)
        }
      },
      metadata: {
        referenceMethod: "pyfa-manual",
        pyfaVersion: row.pyfaVersion ?? null,
        importedAt: new Date().toISOString(),
        importFile: path.basename(inputPath)
      }
    });
    merged += 1;
  }

  const next = [...byFitId.values()].sort((a, b) => String(a.fitId).localeCompare(String(b.fitId)));
  writeFileSync(referencesPath, `${JSON.stringify({ fits: next }, null, 2)}\n`, "utf8");
  console.log(`[dogma:parity:import] merged=${merged} total=${next.length}`);
}

main();
