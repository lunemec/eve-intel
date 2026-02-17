#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const parityPath = path.join(repoRoot, "reports", "dogma-parity-report.json");
const auditPath = path.join(repoRoot, "reports", "dogma-bonus-audit.json");
const outputPath = path.join(repoRoot, "reports", "dogma-parity-open-items.md");

const lines = ["# Dogma Parity Open Items", ""];

if (existsSync(parityPath)) {
  const parity = JSON.parse(readFileSync(parityPath, "utf8"));
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Compared fits: ${parity.comparedFits ?? 0}`);
  lines.push(`Failing fits: ${parity.failingFits ?? 0}`);
  lines.push(`Golden fits: ${parity.goldenFits ?? 0}`);
  lines.push(`Missing golden references: ${(parity.missingGoldenReferences ?? []).length}`);
  lines.push("");
  if ((parity.missingGoldenReferences ?? []).length > 0) {
    lines.push("## Missing Golden References");
    lines.push("");
    for (const fitId of parity.missingGoldenReferences) {
      lines.push(`- ${fitId}`);
    }
    lines.push("");
  }
  lines.push("");
  lines.push("## Failing Fits");
  lines.push("");
  for (const cmp of (parity.comparisons ?? []).filter((c) => !c.pass)) {
    const top = [...cmp.deltas].sort((a, b) => b.absDelta - a.absDelta).slice(0, 4);
    lines.push(`- ${cmp.fitId}`);
    for (const delta of top) {
      lines.push(`  - ${delta.metric}: actual=${delta.actual} expected=${delta.expected} abs=${delta.absDelta.toFixed(3)} rel=${(delta.relDelta * 100).toFixed(2)}%`);
    }
  }
  if ((parity.failingFits ?? 0) === 0) {
    lines.push("- None");
  }
  lines.push("");
}

if (existsSync(auditPath)) {
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  lines.push("## Unmatched Effects (Combat-Relevant)");
  lines.push("");
  lines.push("### Ships");
  for (const item of (audit.combatFocus?.shipEffects ?? []).slice(0, 20)) {
    lines.push(`- ${item.effect} (${item.count})`);
  }
  lines.push("");
  lines.push("### Modules");
  for (const item of (audit.combatFocus?.moduleEffects ?? []).slice(0, 25)) {
    lines.push(`- ${item.effect} (${item.count})`);
  }
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`[dogma:parity] wrote ${path.relative(repoRoot, outputPath)}`);
