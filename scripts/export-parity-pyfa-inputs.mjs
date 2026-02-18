#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeEft } from "../tools/parity/pyfa-adapter/index.mjs";

const repoRoot = process.cwd();
const corpusPath = path.join(repoRoot, "data", "parity", "fit-corpus.jsonl");
const goldenPath = path.join(repoRoot, "data", "parity", "golden-fit-ids.json");
const referencesPath = path.join(repoRoot, "data", "parity", "reference-results.json");
const outputPath = path.join(repoRoot, "data", "parity", "pyfa-inputs.json");

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function main() {
  const corpus = readJsonl(corpusPath);
  const byFitId = new Map(corpus.map((entry) => [entry.fitId, entry]));
  const golden = existsSync(goldenPath) ? JSON.parse(readFileSync(goldenPath, "utf8")) : [];
  const refs = existsSync(referencesPath) ? JSON.parse(readFileSync(referencesPath, "utf8")) : { fits: [] };
  const known = new Set((refs.fits ?? []).map((fit) => fit.fitId));

  const missing = [];
  for (const fitId of golden) {
    if (known.has(fitId)) continue;
    const row = byFitId.get(fitId);
    if (!row) continue;
    const normalized = normalizeEft(row.eft);
    missing.push({
      fitId,
      shipTypeId: row.shipTypeId,
      eft: normalized.normalized,
      shipName: normalized.shipName,
      tags: row.tags ?? [],
      origin: row.origin
    });
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), count: missing.length, fits: missing }, null, 2)}\n`,
    "utf8"
  );

  console.log(`[dogma:parity:export] wrote ${path.relative(repoRoot, outputPath)} count=${missing.length}`);
}

main();
