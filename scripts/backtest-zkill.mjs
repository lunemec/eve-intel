#!/usr/bin/env node

import {
  DEFAULT_RECENCY_BACKTEST_CANDIDATES,
  predictShipIdsByRecency,
  runBacktestCandidateScoring
} from "../src/lib/backtestCore.ts";

const ZKILL_BASE = "https://zkillboard.com/api";
const USAGE = "Usage: node scripts/backtest-zkill.mjs <characterId,characterId,...> [lookbackDays] [topN]";

const idsArg = process.argv[2];
if (!idsArg) {
  console.error(USAGE);
  process.exit(1);
}

const lookbackDays = Number(process.argv[3] ?? 14);
const topN = Number(process.argv[4] ?? 3);
const characterIds = idsArg
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

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

  const scored = runBacktestCandidateScoring({
    samples,
    candidates: DEFAULT_RECENCY_BACKTEST_CANDIDATES,
    lookbackDays,
    topN,
    predictShipTypeIds: ({ sample, kills, losses, lookbackDays, topN, weights }) =>
      predictShipIdsByRecency({
        characterId: sample.characterId,
        kills,
        losses,
        lookbackDays,
        topN,
        weights
      })
  });

  console.log(`Backtest samples: ${samples.length}`);
  console.table(
    scored.results.map((result) => ({
      label: result.label,
      lossEventWeight: result.weights.lossEventWeight,
      halfLifeDivisor: result.weights.halfLifeDivisor,
      total: result.totalSamples,
      hitRate: `${result.hitRate}%`
    }))
  );
  if (scored.best) {
    console.log(`Best: ${scored.best.label} (${scored.best.hitRate}%)`);
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(USAGE);
  process.exit(1);
});

async function fetchZkill(path) {
  const response = await fetch(`${ZKILL_BASE}/${path}`);
  if (!response.ok) {
    throw new Error(`zKill request failed: ${response.status}`);
  }
  return await response.json();
}
