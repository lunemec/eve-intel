import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateDogmaParityFollowupGates } from "./gates.mjs";

export const DEFAULT_DOGMA_PARITY_REPORT_PATH = path.join(
  "reports",
  "dogma-parity-report.json"
);

export const DEFAULT_DOGMA_PARITY_FOLLOWUP_BASELINE_SUMMARY_PATH = path.join(
  "reports",
  "dogma-parity-followup-baseline-summary.json"
);

export const FOLLOWUP_10PCT_THRESHOLD_POLICY = Object.freeze({
  mode: "followup-10pct",
  relMax: 0.1
});

const FOLLOWUP_REQUIRED_FITS_PER_HULL = 10;
const FOLLOWUP_TOP_MISMATCH_LIMIT = 50;

export async function runDogmaParityFollowupBaseline({
  parityReportPath = DEFAULT_DOGMA_PARITY_REPORT_PATH,
  summaryPath = DEFAULT_DOGMA_PARITY_FOLLOWUP_BASELINE_SUMMARY_PATH
} = {}) {
  const resolvedParityReportPath = resolveFromRepoRoot(parityReportPath);
  const resolvedSummaryPath = resolveFromRepoRoot(summaryPath);
  const parityReport = await readJsonFile(resolvedParityReportPath);
  const summary = buildDogmaParityFollowupBaselineSummary({ parityReport });
  await writeJsonFile(resolvedSummaryPath, summary);
  return {
    summaryPath: resolvedSummaryPath,
    summary
  };
}

export function buildDogmaParityFollowupBaselineSummary({
  parityReport,
  thresholdPolicy = FOLLOWUP_10PCT_THRESHOLD_POLICY,
  requiredFitsPerHull = FOLLOWUP_REQUIRED_FITS_PER_HULL
}) {
  const relMax = normalizeRelMax(thresholdPolicy?.relMax);
  const requiredFits = normalizeRequiredFits(requiredFitsPerHull);
  const comparisons = normalizeComparisons(parityReport?.comparisons);
  const hullCounts = new Map();
  const mismatchRows = [];

  const perFit = comparisons
    .map((comparison) => {
      const inScopeDeltas = normalizeDeltas(comparison?.deltas).filter((delta) =>
        isInScopeSurfacedMetric(delta.metric)
      );
      const failingMetrics = inScopeDeltas
        .filter((delta) => delta.relDelta > relMax)
        .map((delta) => ({
          metric: delta.metric,
          absDelta: delta.absDelta,
          relDelta: delta.relDelta
        }))
        .sort(compareMismatchRows);
      const maxRelDelta = inScopeDeltas.reduce(
        (currentMax, delta) => Math.max(currentMax, delta.relDelta),
        0
      );
      const pass = failingMetrics.length === 0;
      const shipTypeId = normalizeShipTypeId(
        comparison?.expected?.shipTypeId ?? comparison?.actual?.shipTypeId
      );

      const currentHull = hullCounts.get(shipTypeId) ?? {
        comparedFits: 0,
        passingFits: 0,
        failingFits: 0
      };
      currentHull.comparedFits += 1;
      if (pass) {
        currentHull.passingFits += 1;
      } else {
        currentHull.failingFits += 1;
      }
      hullCounts.set(shipTypeId, currentHull);

      for (const delta of failingMetrics) {
        mismatchRows.push({
          fitId: comparison.fitId,
          shipTypeId,
          metric: delta.metric,
          absDelta: delta.absDelta,
          relDelta: delta.relDelta
        });
      }

      return {
        fitId: comparison.fitId,
        shipTypeId,
        pass,
        maxRelDelta,
        failingMetrics
      };
    })
    .sort(compareFitRows);

  const failingFits = perFit.filter((row) => !row.pass).length;
  const perHull = [...hullCounts.entries()]
    .sort((left, right) => compareNumbers(left[0], right[0]))
    .map(([shipTypeId, counts]) => ({
      shipTypeId,
      comparedFits: counts.comparedFits,
      passingFits: counts.passingFits,
      failingFits: counts.failingFits,
      requiredFits,
      deficit: Math.max(0, requiredFits - counts.passingFits)
    }));

  const summary = {
    generatedAt: normalizeGeneratedAt(parityReport?.generatedAt),
    thresholdPolicy: {
      mode: normalizeThresholdMode(thresholdPolicy?.mode),
      relMax
    },
    comparedFits: perFit.length,
    failingFits,
    passingFits: perFit.length - failingFits,
    perFit,
    perHull,
    topMismatches: mismatchRows
      .sort(compareMismatchRows)
      .slice(0, FOLLOWUP_TOP_MISMATCH_LIMIT)
  };

  summary.gateEvaluation = evaluateDogmaParityFollowupGates({
    summary,
    requiredFitsPerHull: requiredFits
  });

  return summary;
}

function resolveFromRepoRoot(inputPath) {
  if (typeof inputPath !== "string" || inputPath.trim().length === 0) {
    throw new TypeError("Path must be a non-empty string.");
  }
  return path.resolve(process.cwd(), inputPath);
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeComparisons(comparisons) {
  if (!Array.isArray(comparisons)) {
    return [];
  }

  return comparisons
    .map((comparison) => ({
      fitId: normalizeFitId(comparison?.fitId),
      expected: comparison?.expected ?? {},
      actual: comparison?.actual ?? {},
      deltas: comparison?.deltas
    }))
    .filter((comparison) => comparison.fitId.length > 0);
}

function normalizeDeltas(deltas) {
  if (!Array.isArray(deltas)) {
    return [];
  }

  return deltas
    .map((delta) => ({
      metric: normalizeMetric(delta?.metric),
      absDelta: normalizeDeltaNumber(delta?.absDelta),
      relDelta: normalizeDeltaNumber(delta?.relDelta)
    }))
    .filter((delta) => delta.metric.length > 0);
}

function normalizeFitId(fitId) {
  return typeof fitId === "string" ? fitId.trim() : "";
}

function normalizeMetric(metric) {
  return typeof metric === "string" ? metric.trim() : "";
}

function normalizeDeltaNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.abs(value);
}

function normalizeShipTypeId(value) {
  const candidate = Number(value);
  if (!Number.isInteger(candidate) || candidate < 0) {
    return 0;
  }
  return candidate;
}

function normalizeGeneratedAt(generatedAt) {
  if (typeof generatedAt === "string" && generatedAt.trim().length > 0) {
    return generatedAt.trim();
  }
  return "unknown";
}

function normalizeThresholdMode(mode) {
  if (typeof mode === "string" && mode.trim().length > 0) {
    return mode.trim();
  }
  return "followup-10pct";
}

function normalizeRelMax(relMax) {
  const numeric = Number(relMax);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return FOLLOWUP_10PCT_THRESHOLD_POLICY.relMax;
  }
  return numeric;
}

function normalizeRequiredFits(requiredFitsPerHull) {
  const numeric = Number(requiredFitsPerHull);
  if (!Number.isInteger(numeric) || numeric < 1) {
    return FOLLOWUP_REQUIRED_FITS_PER_HULL;
  }
  return numeric;
}

function isInScopeSurfacedMetric(metric) {
  return metric === "dpsTotal" || metric === "alpha" || metric === "ehp" || metric.startsWith("resists.");
}

function compareFitRows(left, right) {
  return compareStrings(left.fitId, right.fitId) || compareNumbers(left.shipTypeId, right.shipTypeId);
}

function compareMismatchRows(left, right) {
  return (
    compareNumbers(right.relDelta, left.relDelta) ||
    compareNumbers(right.absDelta, left.absDelta) ||
    compareStrings(left.fitId, right.fitId) ||
    compareStrings(left.metric, right.metric) ||
    compareNumbers(left.shipTypeId, right.shipTypeId)
  );
}

function compareStrings(left, right) {
  return String(left).localeCompare(String(right));
}

function compareNumbers(left, right) {
  return Number(left) - Number(right);
}
