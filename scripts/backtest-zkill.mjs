#!/usr/bin/env node

const ZKILL_BASE = "https://zkillboard.com/api";

const idsArg = process.argv[2];
if (!idsArg) {
  console.error("Usage: node scripts/backtest-zkill.mjs <characterId,characterId,...> [lookbackDays] [topN]");
  process.exit(1);
}

const lookbackDays = Number(process.argv[3] ?? 14);
const topN = Number(process.argv[4] ?? 3);
const characterIds = idsArg
  .split(",")
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v > 0);

const candidateWeights = [
  { label: "baseline", lossEventWeight: 1.15, halfLifeDivisor: 2 },
  { label: "loss-heavy", lossEventWeight: 1.35, halfLifeDivisor: 2 },
  { label: "recency-heavy", lossEventWeight: 1.15, halfLifeDivisor: 3 },
  { label: "balanced", lossEventWeight: 1.05, halfLifeDivisor: 2 }
];

(async () => {
  const samples = [];
  for (const characterId of characterIds) {
    const [kills, losses] = await Promise.all([
      fetchZkill(`kills/characterID/${characterId}/pastSeconds/${lookbackDays * 24 * 60 * 60}/`),
      fetchZkill(`losses/characterID/${characterId}/pastSeconds/${lookbackDays * 24 * 60 * 60}/`)
    ]);

    if (kills.length + losses.length < 2) {
      continue;
    }

    samples.push({ characterId, kills, losses });
  }

  if (samples.length === 0) {
    console.log("No usable samples (need at least 2 events per pilot).\n");
    return;
  }

  const results = candidateWeights.map((weights) => {
    let hits = 0;
    let total = 0;

    for (const sample of samples) {
      const target = newestObservedShip(sample.characterId, sample.kills, sample.losses);
      if (!target) continue;

      const kills = sample.kills.filter((k) => k.killmail_id !== target.killmailId);
      const losses = sample.losses.filter((l) => l.killmail_id !== target.killmailId);
      const predicted = predictShipIds(sample.characterId, kills, losses, lookbackDays, topN, weights);
      total += 1;
      if (predicted.includes(target.shipTypeId)) {
        hits += 1;
      }
    }

    return {
      ...weights,
      total,
      hitRate: total > 0 ? Number(((hits / total) * 100).toFixed(1)) : 0
    };
  });

  results.sort((a, b) => b.hitRate - a.hitRate);

  console.log(`Backtest samples: ${samples.length}`);
  console.table(results.map((r) => ({
    label: r.label,
    lossEventWeight: r.lossEventWeight,
    halfLifeDivisor: r.halfLifeDivisor,
    total: r.total,
    hitRate: `${r.hitRate}%`
  })));
  console.log(`Best: ${results[0].label} (${results[0].hitRate}%)`);
})();

async function fetchZkill(path) {
  const response = await fetch(`${ZKILL_BASE}/${path}`);
  if (!response.ok) {
    throw new Error(`zKill request failed: ${response.status}`);
  }
  return await response.json();
}

function newestObservedShip(characterId, kills, losses) {
  const events = [];

  for (const kill of kills) {
    const attacker = kill.attackers?.find((a) => a.character_id === characterId);
    if (attacker?.ship_type_id) {
      events.push({
        shipTypeId: attacker.ship_type_id,
        killmailId: kill.killmail_id,
        occurredAt: Date.parse(kill.killmail_time)
      });
    }
  }

  for (const loss of losses) {
    if (loss.victim?.character_id === characterId && loss.victim?.ship_type_id) {
      events.push({
        shipTypeId: loss.victim.ship_type_id,
        killmailId: loss.killmail_id,
        occurredAt: Date.parse(loss.killmail_time)
      });
    }
  }

  if (events.length < 2) return null;
  events.sort((a, b) => b.occurredAt - a.occurredAt);
  return events[0];
}

function predictShipIds(characterId, kills, losses, lookbackDays, topN, weights) {
  const now = Date.now();
  const byShip = new Map();

  for (const kill of kills) {
    const attacker = kill.attackers?.find((a) => a.character_id === characterId);
    if (!attacker?.ship_type_id) continue;
    const ageDays = (now - Date.parse(kill.killmail_time)) / (1000 * 60 * 60 * 24);
    const recency = Math.exp(-ageDays / Math.max(1, lookbackDays / Math.max(1, weights.halfLifeDivisor)));
    byShip.set(attacker.ship_type_id, (byShip.get(attacker.ship_type_id) ?? 0) + recency);
  }

  for (const loss of losses) {
    if (loss.victim?.character_id !== characterId || !loss.victim?.ship_type_id) continue;
    const ageDays = (now - Date.parse(loss.killmail_time)) / (1000 * 60 * 60 * 24);
    const recency = Math.exp(-ageDays / Math.max(1, lookbackDays / Math.max(1, weights.halfLifeDivisor)));
    byShip.set(loss.victim.ship_type_id, (byShip.get(loss.victim.ship_type_id) ?? 0) + recency * weights.lossEventWeight);
  }

  return [...byShip.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, topN))
    .map(([shipTypeId]) => shipTypeId);
}
