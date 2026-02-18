export type BacktestKillmailLike = {
  killmail_id: number;
  killmail_time: string;
  attackers?: Array<{
    character_id?: number;
    ship_type_id?: number;
  }>;
  victim?: {
    character_id?: number;
    ship_type_id?: number;
  };
};

type BacktestSampleBase<TKillmail extends BacktestKillmailLike> = {
  characterId: number;
  kills: TKillmail[];
  losses: TKillmail[];
};

type BacktestTargetShip = {
  shipTypeId: number;
  killmailId: number;
  occurredAt: number;
};

export type BacktestScoringCandidate<TWeights> = {
  label: string;
  weights: TWeights;
};

export type BacktestScoringResult<TWeights> = {
  label: string;
  weights: TWeights;
  totalSamples: number;
  hitRate: number;
};

export type RecencyBacktestWeights = {
  lossEventWeight: number;
  halfLifeDivisor: number;
};

export const DEFAULT_RECENCY_BACKTEST_CANDIDATES = Object.freeze([
  { label: "baseline", weights: { lossEventWeight: 1.15, halfLifeDivisor: 2 } },
  { label: "loss-heavy", weights: { lossEventWeight: 1.35, halfLifeDivisor: 2 } },
  { label: "recency-heavy", weights: { lossEventWeight: 1.15, halfLifeDivisor: 3 } },
  { label: "balanced", weights: { lossEventWeight: 1.05, halfLifeDivisor: 2 } }
]) as ReadonlyArray<BacktestScoringCandidate<RecencyBacktestWeights>>;

export function runBacktestCandidateScoring<
  TKillmail extends BacktestKillmailLike,
  TSample extends BacktestSampleBase<TKillmail>,
  TWeights
>(params: {
  samples: TSample[];
  candidates: ReadonlyArray<BacktestScoringCandidate<TWeights>>;
  lookbackDays: number;
  topN: number;
  predictShipTypeIds: (input: {
    sample: TSample;
    kills: TKillmail[];
    losses: TKillmail[];
    lookbackDays: number;
    topN: number;
    weights: TWeights;
  }) => number[];
}): { best: BacktestScoringResult<TWeights> | null; results: BacktestScoringResult<TWeights>[] } {
  const results: BacktestScoringResult<TWeights>[] = params.candidates.map((candidate) => {
    let hits = 0;
    let total = 0;

    for (const sample of params.samples) {
      const target = extractTargetShip(sample.characterId, sample.kills, sample.losses);
      if (!target) {
        continue;
      }

      const evidence = removeTargetEvent(sample.kills, sample.losses, target.killmailId);
      const predictedShipTypeIds = params.predictShipTypeIds({
        sample,
        kills: evidence.kills,
        losses: evidence.losses,
        lookbackDays: params.lookbackDays,
        topN: params.topN,
        weights: candidate.weights
      });

      total += 1;
      if (predictedShipTypeIds.includes(target.shipTypeId)) {
        hits += 1;
      }
    }

    return {
      label: candidate.label,
      weights: candidate.weights,
      totalSamples: total,
      hitRate: total > 0 ? Number(((hits / total) * 100).toFixed(1)) : 0
    };
  });

  results.sort((a, b) => b.hitRate - a.hitRate);
  return {
    best: results[0] ?? null,
    results
  };
}

export function predictShipIdsByRecency(params: {
  characterId: number;
  kills: BacktestKillmailLike[];
  losses: BacktestKillmailLike[];
  lookbackDays: number;
  topN: number;
  weights: RecencyBacktestWeights;
  nowMs?: number;
}): number[] {
  const nowMs = params.nowMs ?? Date.now();
  const byShipTypeId = new Map<number, number>();

  for (const kill of params.kills) {
    const attacker = kill.attackers?.find((entry) => entry.character_id === params.characterId);
    if (!attacker?.ship_type_id) {
      continue;
    }

    const ageDays = (nowMs - Date.parse(kill.killmail_time)) / (1000 * 60 * 60 * 24);
    const recency = Math.exp(
      -ageDays / Math.max(1, params.lookbackDays / Math.max(1, params.weights.halfLifeDivisor))
    );

    byShipTypeId.set(attacker.ship_type_id, (byShipTypeId.get(attacker.ship_type_id) ?? 0) + recency);
  }

  for (const loss of params.losses) {
    if (loss.victim?.character_id !== params.characterId || !loss.victim?.ship_type_id) {
      continue;
    }

    const ageDays = (nowMs - Date.parse(loss.killmail_time)) / (1000 * 60 * 60 * 24);
    const recency = Math.exp(
      -ageDays / Math.max(1, params.lookbackDays / Math.max(1, params.weights.halfLifeDivisor))
    );

    byShipTypeId.set(
      loss.victim.ship_type_id,
      (byShipTypeId.get(loss.victim.ship_type_id) ?? 0) + recency * params.weights.lossEventWeight
    );
  }

  return [...byShipTypeId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, params.topN))
    .map(([shipTypeId]) => shipTypeId);
}

function extractTargetShip<TKillmail extends BacktestKillmailLike>(
  characterId: number,
  kills: TKillmail[],
  losses: TKillmail[]
): BacktestTargetShip | null {
  const events: BacktestTargetShip[] = [];

  for (const kill of kills) {
    const attacker = kill.attackers?.find((entry) => entry.character_id === characterId);
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

  if (events.length < 2) {
    return null;
  }

  events.sort((a, b) => b.occurredAt - a.occurredAt);
  return events[0];
}

function removeTargetEvent<TKillmail extends BacktestKillmailLike>(
  kills: TKillmail[],
  losses: TKillmail[],
  killmailId: number
): { kills: TKillmail[]; losses: TKillmail[] } {
  return {
    kills: kills.filter((row) => row.killmail_id !== killmailId),
    losses: losses.filter((row) => row.killmail_id !== killmailId)
  };
}
