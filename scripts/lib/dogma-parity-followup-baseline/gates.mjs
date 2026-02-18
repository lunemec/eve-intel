const DEFAULT_REQUIRED_FITS_PER_HULL = 10;
const DEFAULT_REL_MAX = 0.1;

export const FOLLOWUP_PHASES = Object.freeze([
  Object.freeze({
    phase: "t3-cruiser",
    hulls: Object.freeze([
      Object.freeze({ shipTypeId: 29990, shipName: "Loki" }),
      Object.freeze({ shipTypeId: 29986, shipName: "Legion" }),
      Object.freeze({ shipTypeId: 29988, shipName: "Proteus" }),
      Object.freeze({ shipTypeId: 29984, shipName: "Tengu" })
    ])
  }),
  Object.freeze({
    phase: "t3-destroyer",
    hulls: Object.freeze([
      Object.freeze({ shipTypeId: 35683, shipName: "Hecate" }),
      Object.freeze({ shipTypeId: 34828, shipName: "Jackdaw" }),
      Object.freeze({ shipTypeId: 34317, shipName: "Confessor" }),
      Object.freeze({ shipTypeId: 34562, shipName: "Svipul" })
    ])
  })
]);

export function evaluateDogmaParityFollowupGates({
  summary,
  requiredFitsPerHull = DEFAULT_REQUIRED_FITS_PER_HULL,
  phaseDefinitions = FOLLOWUP_PHASES
} = {}) {
  const requiredFits = normalizeRequiredFits(requiredFitsPerHull);
  const relMax = normalizeRelMax(summary?.thresholdPolicy?.relMax);
  const fits = normalizeFitRows(summary?.perFit, relMax);
  const hullCounts = buildHullCounts(fits);

  let blockedByPhase = null;
  const phases = normalizePhaseDefinitions(phaseDefinitions).map((phaseDefinition) => {
    const hulls = phaseDefinition.hulls.map((hull) => {
      const counts = hullCounts.get(hull.shipTypeId) ?? {
        comparedFits: 0,
        passingFits: 0,
        failingFits: 0
      };
      const deficit = Math.max(0, requiredFits - counts.passingFits);
      return {
        shipTypeId: hull.shipTypeId,
        shipName: hull.shipName,
        comparedFits: counts.comparedFits,
        passingFits: counts.passingFits,
        failingFits: counts.failingFits,
        requiredFits,
        deficit,
        complete: deficit === 0
      };
    });

    const targetMet = hulls.every((hull) => hull.complete);
    const eligible = blockedByPhase === null;
    const complete = eligible && targetMet;
    const status = complete ? "complete" : eligible ? "in_progress" : "blocked";

    const phaseRow = {
      phase: phaseDefinition.phase,
      requiredFits,
      targetMet,
      complete,
      eligible,
      status,
      hulls
    };

    if (!eligible && blockedByPhase) {
      phaseRow.blockedByPhase = blockedByPhase;
    }

    if (blockedByPhase === null && !complete) {
      blockedByPhase = phaseDefinition.phase;
    }

    return phaseRow;
  });

  const fitPassCount = fits.filter((fit) => fit.pass).length;
  const fitFailCount = fits.length - fitPassCount;

  return {
    thresholdPolicy: {
      mode: normalizeThresholdMode(summary?.thresholdPolicy?.mode),
      relMax
    },
    requiredFitsPerHull: requiredFits,
    comparedFits: fits.length,
    fitPassCount,
    fitFailCount,
    fits,
    phases,
    activePhase: phases.find((phase) => !phase.complete)?.phase ?? null,
    complete: phases.length > 0 ? phases.every((phase) => phase.complete) : false
  };
}

function buildHullCounts(fits) {
  const countsByHull = new Map();
  for (const fit of fits) {
    const existing = countsByHull.get(fit.shipTypeId) ?? {
      comparedFits: 0,
      passingFits: 0,
      failingFits: 0
    };
    existing.comparedFits += 1;
    if (fit.pass) {
      existing.passingFits += 1;
    } else {
      existing.failingFits += 1;
    }
    countsByHull.set(fit.shipTypeId, existing);
  }
  return countsByHull;
}

function normalizeFitRows(perFit, relMax) {
  if (!Array.isArray(perFit)) {
    return [];
  }

  return perFit
    .map((fit) => {
      const fitId = normalizeString(fit?.fitId);
      if (!fitId) {
        return null;
      }
      const maxRelDelta = normalizeDeltaNumber(fit?.maxRelDelta);
      const failingMetrics = normalizeFailingMetrics(fit?.failingMetrics, relMax);
      return {
        fitId,
        shipTypeId: normalizeShipTypeId(fit?.shipTypeId),
        pass: failingMetrics.length === 0 && maxRelDelta <= relMax,
        maxRelDelta,
        failingMetrics
      };
    })
    .filter((fit) => fit !== null)
    .sort(compareFitRows);
}

function normalizeFailingMetrics(failingMetrics, relMax) {
  if (!Array.isArray(failingMetrics)) {
    return [];
  }

  return failingMetrics
    .map((delta) => ({
      metric: normalizeString(delta?.metric),
      absDelta: normalizeDeltaNumber(delta?.absDelta),
      relDelta: normalizeDeltaNumber(delta?.relDelta)
    }))
    .filter((delta) => delta.metric.length > 0)
    .filter((delta) => delta.relDelta > relMax)
    .sort(compareMismatchRows);
}

function normalizePhaseDefinitions(phaseDefinitions) {
  if (!Array.isArray(phaseDefinitions)) {
    return [];
  }

  const normalized = [];
  for (const phaseDefinition of phaseDefinitions) {
    const phase = normalizeString(phaseDefinition?.phase);
    if (!phase) {
      continue;
    }

    const seenHullIds = new Set();
    const hulls = [];
    for (const hull of Array.isArray(phaseDefinition?.hulls) ? phaseDefinition.hulls : []) {
      const shipTypeId = normalizeShipTypeId(hull?.shipTypeId);
      if (seenHullIds.has(shipTypeId)) {
        continue;
      }
      seenHullIds.add(shipTypeId);
      hulls.push({
        shipTypeId,
        shipName: normalizeHullName(hull?.shipName, shipTypeId)
      });
    }

    normalized.push({ phase, hulls });
  }

  return normalized;
}

function normalizeRequiredFits(requiredFitsPerHull) {
  const candidate = Number(requiredFitsPerHull);
  if (!Number.isInteger(candidate) || candidate < 1) {
    return DEFAULT_REQUIRED_FITS_PER_HULL;
  }
  return candidate;
}

function normalizeRelMax(relMax) {
  const candidate = Number(relMax);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return DEFAULT_REL_MAX;
  }
  return Math.abs(candidate);
}

function normalizeThresholdMode(mode) {
  const normalized = normalizeString(mode);
  return normalized || "followup-10pct";
}

function normalizeShipTypeId(shipTypeId) {
  const candidate = Number(shipTypeId);
  if (!Number.isInteger(candidate) || candidate < 0) {
    return 0;
  }
  return candidate;
}

function normalizeHullName(shipName, shipTypeId) {
  const normalized = normalizeString(shipName);
  return normalized || `ship-${shipTypeId}`;
}

function normalizeDeltaNumber(value) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return 0;
  }
  return Math.abs(candidate);
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function compareFitRows(left, right) {
  return compareStrings(left.fitId, right.fitId) || compareNumbers(left.shipTypeId, right.shipTypeId);
}

function compareMismatchRows(left, right) {
  return (
    compareNumbers(right.relDelta, left.relDelta) ||
    compareNumbers(right.absDelta, left.absDelta) ||
    compareStrings(left.metric, right.metric)
  );
}

function compareStrings(left, right) {
  return String(left).localeCompare(String(right));
}

function compareNumbers(left, right) {
  return Number(left) - Number(right);
}
