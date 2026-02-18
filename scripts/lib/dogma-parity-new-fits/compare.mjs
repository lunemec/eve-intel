export const PHASE1_THRESHOLDS = {
  dps: { rel: 0.08, abs: 25 },
  alpha: { rel: 0.08, abs: 25 },
  ehp: { rel: 0.1, abs: 500 },
  resistAbs: 0.05
};

export const CI_THRESHOLDS = {
  dps: { rel: 0.05, abs: 15 },
  alpha: { rel: 0.05, abs: 15 },
  ehp: { rel: 0.07, abs: 350 },
  resistAbs: 0.03
};

export async function compareDogmaParityForScope(
  {
    newFitIds = [],
    corpusEntries = [],
    referenceFits = [],
    mode = "sample",
    computeActualForFit
  } = {},
  { compareFn = compareParityResults } = {}
) {
  if (!Array.isArray(corpusEntries)) {
    throw new TypeError("corpusEntries must be an array.");
  }
  if (!Array.isArray(referenceFits)) {
    throw new TypeError("referenceFits must be an array.");
  }
  if (typeof computeActualForFit !== "function") {
    throw new TypeError("computeActualForFit must be a function.");
  }

  const thresholds = resolveDogmaParityThresholds(mode);
  const scopedFitIds = normalizeFitIds(newFitIds);

  const corpusByFitId = buildByFitIdMap(corpusEntries);
  const referenceByFitId = buildByFitIdMap(referenceFits);

  const comparedFitIds = [];
  const missingCorpusFitIds = [];
  const missingReferenceFitIds = [];
  const comparisons = [];
  const failed = [];

  for (const fitId of scopedFitIds) {
    const corpusEntry = corpusByFitId.get(fitId);
    if (!corpusEntry) {
      missingCorpusFitIds.push(fitId);
      continue;
    }

    const expected = referenceByFitId.get(fitId);
    if (!expected) {
      missingReferenceFitIds.push(fitId);
      continue;
    }

    try {
      const actual = await computeActualForFit({ fitId, corpusEntry, expected });
      comparedFitIds.push(fitId);
      comparisons.push(
        compareFn({
          expected,
          actual,
          thresholds
        })
      );
    } catch (error) {
      failed.push(toDogmaComputeFailure({ fitId, error }));
    }
  }

  const mismatches = comparisons.filter((comparison) => !comparison.pass);

  return {
    mode: normalizeMode(mode),
    thresholds,
    scopedFitIds,
    scopedFitCount: scopedFitIds.length,
    comparedFitIds,
    comparedFitCount: comparedFitIds.length,
    missingCorpusFitIds,
    missingReferenceFitIds,
    comparisons,
    failed,
    mismatches,
    mismatchCount: mismatches.length
  };
}

export function resolveDogmaParityThresholds(mode = "sample") {
  return normalizeMode(mode) === "ci" ? CI_THRESHOLDS : PHASE1_THRESHOLDS;
}

function compareParityResults({ expected, actual, thresholds }) {
  const deltas = [];

  deltas.push(compareScalar("dpsTotal", actual.dpsTotal, expected.dpsTotal, thresholds.dps));
  deltas.push(compareScalar("alpha", actual.alpha, expected.alpha, thresholds.alpha));
  deltas.push(compareScalar("ehp", actual.ehp, expected.ehp, thresholds.ehp));

  for (const layer of ["shield", "armor", "hull"]) {
    for (const dtype of ["em", "therm", "kin", "exp"]) {
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
    pass: deltas.every((delta) => delta.pass),
    deltas
  };
}

function compareScalar(metric, actual, expected, limit) {
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

function relativeDelta(actual, expected) {
  const denom = Math.max(1e-9, Math.abs(expected));
  return Math.abs(actual - expected) / denom;
}

function buildByFitIdMap(records) {
  const byFitId = new Map();
  for (const record of records) {
    const fitId = normalizeOptionalString(record?.fitId);
    if (!fitId || byFitId.has(fitId)) {
      continue;
    }
    byFitId.set(fitId, record);
  }
  return byFitId;
}

function normalizeFitIds(newFitIds) {
  if (!Array.isArray(newFitIds)) {
    throw new TypeError("newFitIds must be an array.");
  }

  const normalized = new Set();
  for (const rawFitId of newFitIds) {
    const fitId = normalizeOptionalString(rawFitId);
    if (!fitId) {
      continue;
    }
    normalized.add(fitId);
  }

  return [...normalized].sort(compareStrings);
}

function normalizeMode(mode) {
  return mode === "ci" ? "ci" : "sample";
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toDogmaComputeFailure({ fitId, error }) {
  const details = normalizeErrorDetails(error);
  return {
    fitId,
    reason: "dogma_compute_failed",
    error: formatErrorMessage(error),
    ...(normalizeOptionalString(details.stage)
      ? { stage: normalizeOptionalString(details.stage) }
      : {}),
    ...(normalizeOptionalString(details.stderrTail)
      ? { stderrTail: normalizeOptionalString(details.stderrTail) }
      : {})
  };
}

function normalizeErrorDetails(error) {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return {};
  }
  const details = error.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }
  return details;
}

function formatErrorMessage(error) {
  const message = normalizeOptionalString(error?.message);
  return message ?? String(error ?? "Unknown error");
}

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
