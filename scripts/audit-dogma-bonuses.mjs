import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "public", "data", "dogma-manifest.json");
const outputDir = path.join(repoRoot, "reports");
const outputJsonPath = path.join(outputDir, "dogma-bonus-audit.json");
const outputMdPath = path.join(outputDir, "dogma-bonus-audit.md");

const SHIP_EFFECT_PATTERNS = [
  /hybridrof/i,
  /hybriddamage/i,
  /projectilerof/i,
  /projectiledamage/i,
  /energyrof/i,
  /energydamage/i,
  /missilerof/i,
  /missiledamage/i,
  /shipbonusmediumdronedamagemultiplierpiratefaction/i,
  /armorresist/i,
  /shieldresist/i,
  /shipbonusarmorhpad2/i,
  /armorhp/i,
  /interdictorsmwdsigradius/i
];

const MODULE_EFFECT_PATTERNS = [
  /damagecontrol/i,
  /modifyactiveshieldresonancepostpercent/i,
  /modifyactivearmorresonancepostpercent/i,
  /modifyarmorresonancepostpercent/i,
  /modifyshieldresonancepostpercent/i,
  /structureresonance/i,
  /hull/i,
  /shieldcapacity/i,
  /shieldhpmultiply/i,
  /shieldhpbonus/i,
  /drawbackmaxvelocity/i,
  /targetattack/i,
  /usemissiles/i,
  /projectilefired/i,
  /turretfitted/i
];

const COMBAT_RELEVANT_EFFECT_HINTS = [
  /bonus/i,
  /damage/i,
  /rof/i,
  /resist/i,
  /resonance/i,
  /velocity/i,
  /speed/i,
  /shield/i,
  /armor/i,
  /hull/i,
  /signature/i,
  /tracking/i,
  /range/i,
  /falloff/i,
  /drone/i,
  /missile/i,
  /turret/i
];

async function main() {
  if (!existsSync(manifestPath)) {
    throw new Error("Missing public/data/dogma-manifest.json. Run npm run sde:prepare first.");
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const packPath = path.join(repoRoot, "public", "data", manifest.packFile);
  if (!existsSync(packPath)) {
    throw new Error(`Missing dogma pack ${manifest.packFile}. Run npm run sde:prepare first.`);
  }

  const pack = JSON.parse(await readFile(packPath, "utf8"));
  const categoryById = new Map((pack.categories ?? []).map((c) => [Number(c.categoryId), c.name]));

  const ships = [];
  const modules = [];
  for (const type of pack.types ?? []) {
    const categoryName = (categoryById.get(Number(type.categoryId)) ?? "").toLowerCase();
    if (categoryName === "ship") {
      ships.push(type);
      continue;
    }
    if (categoryName === "module") {
      modules.push(type);
    }
  }

  const shipSummary = summarizeEffects(ships, SHIP_EFFECT_PATTERNS);
  const moduleSummary = summarizeEffects(modules, MODULE_EFFECT_PATTERNS);

  const report = {
    generatedAt: new Date().toISOString(),
    manifestVersion: manifest.activeVersion,
    packFile: manifest.packFile,
    totals: {
      ships: ships.length,
      modules: modules.length
    },
    shipEffects: shipSummary,
    moduleEffects: moduleSummary,
    combatFocus: {
      shipEffects: filterCombatRelevant(shipSummary.unmatchedTop),
      moduleEffects: filterCombatRelevant(moduleSummary.unmatchedTop)
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outputMdPath, renderMarkdown(report), "utf8");

  log(`Ships scanned: ${ships.length}`);
  log(`Modules scanned: ${modules.length}`);
  log(`Ship effect names seen: ${shipSummary.totalDistinctEffects}`);
  log(`Ship effects matched by calculator patterns: ${shipSummary.matchedDistinctEffects}`);
  log(`Ship effects unmatched: ${shipSummary.unmatchedDistinctEffects}`);
  log(`Module effect names seen: ${moduleSummary.totalDistinctEffects}`);
  log(`Module effects matched by calculator patterns: ${moduleSummary.matchedDistinctEffects}`);
  log(`Module effects unmatched: ${moduleSummary.unmatchedDistinctEffects}`);
  log(`Wrote ${path.relative(repoRoot, outputJsonPath)}`);
  log(`Wrote ${path.relative(repoRoot, outputMdPath)}`);
}

function summarizeEffects(types, handledPatterns) {
  const effectToTypes = new Map();

  for (const type of types) {
    const effects = Array.isArray(type.effects) ? type.effects : [];
    for (const effect of effects) {
      if (!effect) {
        continue;
      }
      const bucket = effectToTypes.get(effect) ?? [];
      bucket.push({ typeId: type.typeId, name: type.name });
      effectToTypes.set(effect, bucket);
    }
  }

  const entries = Array.from(effectToTypes.entries()).map(([effect, refs]) => {
    const handled = handledPatterns.some((pattern) => pattern.test(effect));
    return {
      effect,
      handled,
      count: refs.length,
      samples: refs.slice(0, 6)
    };
  });

  entries.sort((a, b) => b.count - a.count || a.effect.localeCompare(b.effect));

  const matched = entries.filter((entry) => entry.handled);
  const unmatched = entries.filter((entry) => !entry.handled);

  return {
    totalDistinctEffects: entries.length,
    matchedDistinctEffects: matched.length,
    unmatchedDistinctEffects: unmatched.length,
    matchedTop: matched.slice(0, 40),
    unmatchedTop: unmatched.slice(0, 120)
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Dogma Bonus Coverage Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Manifest version: ${report.manifestVersion}`);
  lines.push(`Pack: \`${report.packFile}\``);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Ships scanned: ${report.totals.ships}`);
  lines.push(`- Modules scanned: ${report.totals.modules}`);
  lines.push("");
  lines.push("## Ship Effects");
  lines.push("");
  lines.push(`- Distinct effect names: ${report.shipEffects.totalDistinctEffects}`);
  lines.push(`- Matched by current calculator rules: ${report.shipEffects.matchedDistinctEffects}`);
  lines.push(`- Unmatched: ${report.shipEffects.unmatchedDistinctEffects}`);
  lines.push(`- Combat-relevant unmatched (heuristic): ${report.combatFocus.shipEffects.length}`);
  lines.push("");
  lines.push("Top unmatched ship effects:");
  lines.push("");
  lines.push("| Effect | Hulls | Sample hulls |");
  lines.push("| --- | ---: | --- |");
  for (const item of report.shipEffects.unmatchedTop.slice(0, 40)) {
    lines.push(`| \`${item.effect}\` | ${item.count} | ${item.samples.map((s) => `${s.name} (${s.typeId})`).join(", ")} |`);
  }
  lines.push("");
  lines.push("Combat-relevant unmatched ship effects:");
  lines.push("");
  lines.push("| Effect | Hulls | Sample hulls |");
  lines.push("| --- | ---: | --- |");
  for (const item of report.combatFocus.shipEffects.slice(0, 30)) {
    lines.push(`| \`${item.effect}\` | ${item.count} | ${item.samples.map((s) => `${s.name} (${s.typeId})`).join(", ")} |`);
  }
  lines.push("");
  lines.push("## Module Effects");
  lines.push("");
  lines.push(`- Distinct effect names: ${report.moduleEffects.totalDistinctEffects}`);
  lines.push(`- Matched by current calculator rules: ${report.moduleEffects.matchedDistinctEffects}`);
  lines.push(`- Unmatched: ${report.moduleEffects.unmatchedDistinctEffects}`);
  lines.push(`- Combat-relevant unmatched (heuristic): ${report.combatFocus.moduleEffects.length}`);
  lines.push("");
  lines.push("Top unmatched module effects:");
  lines.push("");
  lines.push("| Effect | Modules | Sample modules |");
  lines.push("| --- | ---: | --- |");
  for (const item of report.moduleEffects.unmatchedTop.slice(0, 80)) {
    lines.push(`| \`${item.effect}\` | ${item.count} | ${item.samples.map((s) => `${s.name} (${s.typeId})`).join(", ")} |`);
  }
  lines.push("");
  lines.push("Combat-relevant unmatched module effects:");
  lines.push("");
  lines.push("| Effect | Modules | Sample modules |");
  lines.push("| --- | ---: | --- |");
  for (const item of report.combatFocus.moduleEffects.slice(0, 40)) {
    lines.push(`| \`${item.effect}\` | ${item.count} | ${item.samples.map((s) => `${s.name} (${s.typeId})`).join(", ")} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function filterCombatRelevant(entries) {
  return entries.filter((entry) => COMBAT_RELEVANT_EFFECT_HINTS.some((pattern) => pattern.test(entry.effect)));
}

function log(message) {
  console.log(`[audit:bonuses] ${message}`);
}

main().catch((error) => {
  console.error("[audit:bonuses] fatal", error);
  process.exit(1);
});
