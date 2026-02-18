import type { ParsedPilotInput } from "../types";
import type { ZkillKillmail } from "./api/zkill";
import { deriveShipPredictions, type ScoringWeights } from "./intel";
import { runBacktestCandidateScoring } from "./backtestCore";

export type BacktestSample = {
  parsedEntry: ParsedPilotInput;
  characterId: number;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
};

export type BacktestCandidate = {
  label: string;
  weights: ScoringWeights;
};

export type BacktestResult = {
  label: string;
  weights: ScoringWeights;
  totalSamples: number;
  hitRate: number;
};

export function tuneScoringWeights(params: {
  samples: BacktestSample[];
  candidates: BacktestCandidate[];
  lookbackDays: number;
  topN: number;
  shipNamesByTypeId: Map<number, string>;
}): { best: BacktestResult | null; results: BacktestResult[] } {
  return runBacktestCandidateScoring({
    samples: params.samples,
    candidates: params.candidates,
    lookbackDays: params.lookbackDays,
    topN: params.topN,
    predictShipTypeIds: ({ sample, kills, losses, lookbackDays, topN, weights }) => {
      const predicted = deriveShipPredictions({
        parsedEntry: sample.parsedEntry,
        characterId: sample.characterId,
        kills: kills as ZkillKillmail[],
        losses: losses as ZkillKillmail[],
        lookbackDays,
        topShips: topN,
        shipNamesByTypeId: params.shipNamesByTypeId,
        weights
      });

      return predicted
        .map((row) => row.shipTypeId)
        .filter((shipTypeId): shipTypeId is number => typeof shipTypeId === "number");
    }
  });
}
