import type { ParityComparison, ParityDelta, ParityMetricResult, ParityThresholds } from "./types";

export function compareParityResults(params: {
  expected: ParityMetricResult;
  actual: ParityMetricResult;
  thresholds: ParityThresholds;
}): ParityComparison {
  const { expected, actual, thresholds } = params;
  const deltas: ParityDelta[] = [];

  deltas.push(compareScalar("dpsTotal", actual.dpsTotal, expected.dpsTotal, thresholds.dps));
  deltas.push(compareScalar("alpha", actual.alpha, expected.alpha, thresholds.alpha));
  deltas.push(compareScalar("ehp", actual.ehp, expected.ehp, thresholds.ehp));

  for (const layer of ["shield", "armor", "hull"] as const) {
    for (const dtype of ["em", "therm", "kin", "exp"] as const) {
      const metric = `resists.${layer}.${dtype}`;
      const actualValue = actual.resists[layer][dtype];
      const expectedValue = expected.resists[layer][dtype];
      const absDelta = Math.abs(actualValue - expectedValue);
      deltas.push({
        metric,
        actual: actualValue,
        expected: expectedValue,
        absDelta,
        relDelta: relativeDelta(actualValue, expectedValue),
        pass: absDelta <= thresholds.resistAbs
      });
    }
  }

  return {
    fitId: expected.fitId,
    expected,
    actual,
    thresholds,
    pass: deltas.every((d) => d.pass),
    deltas
  };
}

function compareScalar(
  metric: string,
  actual: number,
  expected: number,
  limit: { rel: number; abs: number }
): ParityDelta {
  const absDelta = Math.abs(actual - expected);
  const relDelta = relativeDelta(actual, expected);
  return {
    metric,
    actual,
    expected,
    absDelta,
    relDelta,
    pass: absDelta <= Math.max(limit.abs, Math.abs(expected) * limit.rel)
  };
}

function relativeDelta(actual: number, expected: number): number {
  const denom = Math.max(1e-9, Math.abs(expected));
  return Math.abs(actual - expected) / denom;
}
