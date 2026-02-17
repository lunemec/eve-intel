import type { LayerResists } from "../types";

export type ParitySource = "app" | "pyfa" | "svcfitstat";

export type ParityMetricResult = {
  fitId: string;
  shipTypeId: number;
  source: ParitySource;
  sdeVersion: string;
  dpsTotal: number;
  alpha: number;
  ehp: number;
  resists: LayerResists;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ParityThresholds = {
  dps: { rel: number; abs: number };
  alpha: { rel: number; abs: number };
  ehp: { rel: number; abs: number };
  resistAbs: number;
};

export type ParityDelta = {
  metric: string;
  actual: number;
  expected: number;
  absDelta: number;
  relDelta: number;
  pass: boolean;
};

export type ParityComparison = {
  fitId: string;
  expected: ParityMetricResult;
  actual: ParityMetricResult;
  thresholds: ParityThresholds;
  pass: boolean;
  deltas: ParityDelta[];
};

export type FitCorpusEntry = {
  fitId: string;
  shipTypeId: number;
  eft: string;
  origin: "zkill" | "manual" | "svcfitstat";
  tags: string[];
};

export const PHASE1_THRESHOLDS: ParityThresholds = {
  dps: { rel: 0.08, abs: 25 },
  alpha: { rel: 0.08, abs: 25 },
  ehp: { rel: 0.1, abs: 500 },
  resistAbs: 0.05
};

export const CI_THRESHOLDS: ParityThresholds = {
  dps: { rel: 0.05, abs: 15 },
  alpha: { rel: 0.05, abs: 15 },
  ehp: { rel: 0.07, abs: 350 },
  resistAbs: 0.03
};
