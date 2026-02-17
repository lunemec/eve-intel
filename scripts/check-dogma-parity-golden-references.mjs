#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const goldenPath = path.join(repoRoot, "data", "parity", "golden-fit-ids.json");
const referencesPath = path.join(repoRoot, "data", "parity", "reference-results.json");
const reportPath = path.join(repoRoot, "reports", "dogma-parity-reference-sync.json");

if (!existsSync(goldenPath)) {
  console.error(`[dogma:parity:check] missing ${path.relative(repoRoot, goldenPath)}`);
  process.exit(1);
}
if (!existsSync(referencesPath)) {
  console.error(`[dogma:parity:check] missing ${path.relative(repoRoot, referencesPath)}`);
  process.exit(1);
}

const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
const references = JSON.parse(readFileSync(referencesPath, "utf8"));
const known = new Set((references.fits ?? []).map((fit) => fit.fitId));
const missing = golden.filter((fitId) => !known.has(fitId));

if (missing.length > 0) {
  console.error(
    `[dogma:parity:check] missing ${missing.length} golden references: ${missing.join(", ")}`
  );
  if (existsSync(reportPath)) {
    console.error(`[dogma:parity:check] see ${path.relative(repoRoot, reportPath)} for diagnostics`);
  }
  process.exit(1);
}

console.log(`[dogma:parity:check] all golden references present (${golden.length})`);
