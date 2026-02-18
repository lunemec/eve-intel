const DEFAULT_REQUIRED_FITS_PER_HULL = 10;
const DEFAULT_REL_MAX = 0.1;
const DEFAULT_THRESHOLD_MODE = "followup-10pct";

export const FOLLOWUP_PRIORITY_SCORING_MODEL = "followup-priority-v1";

export function buildDogmaParityFollowupPrioritizationBacklog({ summary } = {}) {
  const normalizedSummary = summary ?? {};
  const thresholdPolicy = normalizeThresholdPolicy(normalizedSummary.thresholdPolicy);
  const requiredFits = normalizeRequiredFits(
    normalizedSummary?.gateEvaluation?.requiredFitsPerHull
  );
  const hullDeficits = buildHullDeficitMap(normalizedSummary, requiredFits);
  const rows = collectFailingRows(normalizedSummary.perFit, thresholdPolicy.relMax);
  const groupedRows = groupRowsByMechanicFamily(rows);

  const items = [...groupedRows.entries()]
    .map(([family, familyRows]) =>
      buildBacklogItem({
        family,
        rows: familyRows,
        hullDeficits,
        requiredFits
      })
    )
    .sort(compareBacklogItems);

  return {
    generatedAt: normalizeGeneratedAt(normalizedSummary.generatedAt),
    thresholdPolicy,
    scoringModel: FOLLOWUP_PRIORITY_SCORING_MODEL,
    items
  };
}

function collectFailingRows(perFit, relMax) {
  if (!Array.isArray(perFit)) {
    return [];
  }

  const rows = [];
  for (const fit of perFit) {
    const fitId = normalizeString(fit?.fitId);
    if (!fitId) {
      continue;
    }
    const shipTypeId = normalizeShipTypeId(fit?.shipTypeId);
    const metrics = Array.isArray(fit?.failingMetrics) ? fit.failingMetrics : [];
    for (const metricRow of metrics) {
      const metric = normalizeString(metricRow?.metric);
      if (!metric) {
        continue;
      }
      const relDelta = normalizeDelta(metricRow?.relDelta);
      if (relDelta <= relMax) {
        continue;
      }
      rows.push({
        fitId,
        shipTypeId,
        metric,
        absDelta: normalizeDelta(metricRow?.absDelta),
        relDelta,
        mechanicFamily: mapMetricToMechanicFamily(metric)
      });
    }
  }
  return rows;
}

function buildBacklogItem({ family, rows, hullDeficits, requiredFits }) {
  const fitIds = uniqueSorted(rows.map((row) => row.fitId), compareStrings);
  const shipTypeIds = uniqueSorted(rows.map((row) => row.shipTypeId), compareNumbers);
  const metrics = uniqueSorted(rows.map((row) => row.metric), compareStrings);
  const errorSeverity = roundNumber(
    rows.reduce((currentMax, row) => Math.max(currentMax, row.relDelta), 0)
  );
  const hullGatePressure = roundNumber(
    shipTypeIds.reduce((currentMax, shipTypeId) => {
      const deficit = hullDeficits.get(shipTypeId) ?? 0;
      const pressure = 1 + deficit / requiredFits;
      return Math.max(currentMax, pressure);
    }, 1)
  );
  const mechanicReuse = shipTypeIds.length;
  const fitPrevalence = fitIds.length;
  const score = roundNumber(errorSeverity * hullGatePressure * mechanicReuse * fitPrevalence);

  return {
    id: `cluster-${family}`,
    likelyMechanicFamily: family,
    fitIds,
    shipTypeIds,
    metrics,
    score,
    scoreBreakdown: {
      errorSeverity,
      hullGatePressure,
      mechanicReuse,
      fitPrevalence
    },
    status: "todo"
  };
}

function buildHullDeficitMap(summary, requiredFits) {
  const map = new Map();

  const phases = Array.isArray(summary?.gateEvaluation?.phases)
    ? summary.gateEvaluation.phases
    : [];
  for (const phase of phases) {
    for (const hull of Array.isArray(phase?.hulls) ? phase.hulls : []) {
      const shipTypeId = normalizeShipTypeId(hull?.shipTypeId);
      const deficit = normalizeDeficit(hull?.deficit, requiredFits);
      map.set(shipTypeId, deficit);
    }
  }

  for (const hull of Array.isArray(summary?.perHull) ? summary.perHull : []) {
    const shipTypeId = normalizeShipTypeId(hull?.shipTypeId);
    if (map.has(shipTypeId)) {
      continue;
    }
    map.set(shipTypeId, normalizeDeficit(hull?.deficit, requiredFits));
  }

  return map;
}

function normalizeDeficit(deficit, requiredFits) {
  const candidate = Number(deficit);
  if (!Number.isFinite(candidate) || candidate < 0) {
    return 0;
  }
  return Math.min(requiredFits, Math.round(candidate));
}

function groupRowsByMechanicFamily(rows) {
  const groups = new Map();
  for (const row of rows) {
    const groupRows = groups.get(row.mechanicFamily) ?? [];
    groupRows.push(row);
    groups.set(row.mechanicFamily, groupRows);
  }
  return groups;
}

function normalizeThresholdPolicy(policy) {
  return {
    mode: normalizeThresholdMode(policy?.mode),
    relMax: normalizeRelMax(policy?.relMax)
  };
}

function normalizeGeneratedAt(generatedAt) {
  const value = normalizeString(generatedAt);
  return value || "unknown";
}

function normalizeThresholdMode(mode) {
  const value = normalizeString(mode);
  return value || DEFAULT_THRESHOLD_MODE;
}

function normalizeRelMax(relMax) {
  const value = Number(relMax);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_REL_MAX;
  }
  return roundNumber(Math.abs(value));
}

function normalizeRequiredFits(requiredFitsPerHull) {
  const value = Number(requiredFitsPerHull);
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_REQUIRED_FITS_PER_HULL;
  }
  return value;
}

function normalizeDelta(value) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return 0;
  }
  return roundNumber(Math.abs(candidate));
}

function normalizeShipTypeId(shipTypeId) {
  const candidate = Number(shipTypeId);
  if (!Number.isInteger(candidate) || candidate < 0) {
    return 0;
  }
  return candidate;
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function mapMetricToMechanicFamily(metric) {
  if (metric === "dpsTotal" || metric === "alpha") {
    return "damage-output";
  }
  if (metric === "ehp") {
    return "effective-hit-points";
  }
  if (metric.startsWith("resists.")) {
    return "resist-profile";
  }
  return "other-surfaced";
}

function uniqueSorted(values, compareFn) {
  const unique = [...new Set(values)];
  return unique.sort(compareFn);
}

function compareBacklogItems(left, right) {
  return (
    compareNumbers(right.score, left.score) ||
    compareNumbers(right.scoreBreakdown.errorSeverity, left.scoreBreakdown.errorSeverity) ||
    compareStrings(left.likelyMechanicFamily, right.likelyMechanicFamily) ||
    compareStrings(left.id, right.id)
  );
}

function compareNumbers(left, right) {
  return Number(left) - Number(right);
}

function compareStrings(left, right) {
  return String(left).localeCompare(String(right));
}

function roundNumber(value) {
  return Number(Number(value).toFixed(6));
}
