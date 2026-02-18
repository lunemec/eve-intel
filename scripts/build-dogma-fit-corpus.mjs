#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const repoRoot = process.cwd();
const corpusPath = path.join(repoRoot, "data", "parity", "fit-corpus.jsonl");

const characterArg = process.argv[2] ?? "";
const lookbackDays = Number(process.argv[3] ?? 14);

async function main() {
  const existing = loadJsonl(corpusPath);
  const byKey = new Map(existing.map((entry) => [fingerprint(entry.eft), entry]));

  const characterIds = characterArg
    .split(",")
    .map((raw) => Number(raw.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  for (const characterId of characterIds) {
    const losses = await fetchZkill(
      `https://zkillboard.com/api/losses/characterID/${characterId}/pastSeconds/${lookbackDays * 24 * 60 * 60}/`
    );
    for (const loss of losses) {
      const eft = buildPseudoEft(loss);
      if (!eft) continue;
      const key = fingerprint(eft.eft);
      if (byKey.has(key)) continue;
      byKey.set(key, {
        fitId: `zkill-${loss.killmail_id}`,
        shipTypeId: eft.shipTypeId,
        eft: eft.eft,
        origin: "zkill",
        tags: inferTags(eft.eft)
      });
    }
  }

  const next = [...byKey.values()].sort((a, b) => a.fitId.localeCompare(b.fitId));
  await writeFile(corpusPath, `${next.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  console.log(`[dogma:fixtures] corpus entries=${next.length}`);
}

function loadJsonl(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function fingerprint(eft) {
  return createHash("sha256")
    .update(
      eft
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .sort()
        .join("\n")
    )
    .digest("hex");
}

function inferTags(eft) {
  const lower = eft.toLowerCase();
  const tags = [];
  if (/(blaster|rail|hybrid)/.test(lower)) tags.push("hybrid-turret");
  if (/(autocannon|artillery|projectile)/.test(lower)) tags.push("projectile-turret");
  if (/(laser|beam|pulse)/.test(lower)) tags.push("laser-turret");
  if (/(launcher|missile|rocket|torpedo)/.test(lower)) tags.push("missile");
  if (/drone/.test(lower)) tags.push("drone-primary");
  if (/(shield|invulnerability|extender)/.test(lower)) tags.push("shield-tank");
  if (/(armor|plate|membrane)/.test(lower)) tags.push("armor-tank");
  return tags;
}

function buildPseudoEft(loss) {
  const victimShip = Number(loss?.victim?.ship_type_id ?? 0);
  if (!victimShip) return null;
  const items = Array.isArray(loss?.victim?.items) ? loss.victim.items : [];
  const moduleLines = [];
  for (const item of items) {
    if (!item?.item_type_id) continue;
    const qty = Number(item?.quantity_destroyed ?? item?.quantity_dropped ?? 1);
    const label = `Type ${item.item_type_id}`;
    moduleLines.push(qty > 1 ? `${label} x${qty}` : label);
  }
  if (moduleLines.length === 0) return null;
  return {
    shipTypeId: victimShip,
    eft: `[Type ${victimShip}, zkill-${loss.killmail_id}]\n\n${moduleLines.join("\n")}`
  };
}

async function fetchZkill(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`zKill fetch failed: ${res.status}`);
  }
  return res.json();
}

main().catch((error) => {
  console.error("[dogma:fixtures] fatal", error);
  process.exit(1);
});
