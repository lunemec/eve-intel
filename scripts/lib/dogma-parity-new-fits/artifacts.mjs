import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PYFA_RUN_EVENT_STATUS_ORDER = new Map([
  ["added", 0],
  ["skipped", 1],
  ["failed", 2]
]);

export const DEFAULT_DOGMA_PARITY_NEW_FITS_REPORT_PATH = path.join(
  "reports",
  "dogma-parity-new-fits-report.json"
);

export async function writeDogmaParityNewFitArtifacts({
  scope,
  syncResult,
  compareResult,
  exitCode,
  reportPath = DEFAULT_DOGMA_PARITY_NEW_FITS_REPORT_PATH,
  diagnosticsPath
}) {
  validateWriteArtifactInput({
    scope,
    syncResult,
    compareResult,
    reportPath,
    diagnosticsPath
  });

  const report = buildDogmaParityNewFitReport({
    scope,
    syncResult,
    compareResult,
    exitCode
  });

  await writeJsonFile(reportPath, report);

  let diagnosticsEventsWritten = 0;
  if (diagnosticsPath) {
    const diagnosticsEvents = buildDogmaParityNewFitDiagnosticsEvents({
      scope,
      syncResult,
      compareResult,
      report
    });
    diagnosticsEventsWritten = diagnosticsEvents.length;
    await writeJsonlFile(diagnosticsPath, diagnosticsEvents);
  }

  return {
    report,
    diagnosticsEventsWritten
  };
}

export function buildDogmaParityNewFitReport({
  scope,
  syncResult,
  compareResult,
  exitCode
}) {
  const scopedFitIds = normalizeFitIds(scope?.newFitIds);
  const missingCorpusFitIds = mergeAndNormalizeFitIds(
    syncResult?.missingCorpusFitIds,
    compareResult?.missingCorpusFitIds
  );
  const missingReferenceFitIds = normalizeFitIds(compareResult?.missingReferenceFitIds);
  const mismatches = normalizeReportMismatches(compareResult?.mismatches);
  const pyfaFailures = normalizePyfaFailures(syncResult?.failed);

  return {
    generatedAt: normalizeGeneratedAt(scope?.generatedAt),
    runId: normalizeRunId(scope?.runId),
    scopedFitCount: scopedFitIds.length,
    comparedFitCount: normalizeNonNegativeInteger(
      compareResult?.comparedFitCount,
      normalizeFitIds(compareResult?.comparedFitIds).length
    ),
    mismatchCount: normalizeNonNegativeInteger(compareResult?.mismatchCount, mismatches.length),
    pyfaFailureCount: normalizeNonNegativeInteger(syncResult?.pyfaFailureCount, pyfaFailures.length),
    missingCorpusFitIds,
    missingReferenceFitIds,
    mismatches,
    pyfaFailures,
    exitCode: normalizeExitCode(exitCode)
  };
}

export function buildDogmaParityNewFitDiagnosticsEvents({
  scope,
  syncResult,
  compareResult,
  report
}) {
  const at = normalizeGeneratedAt(report?.generatedAt ?? scope?.generatedAt);
  const runId = normalizeRunId(scope?.runId);
  const events = [];

  for (const fitId of normalizeFitIds(scope?.newFitIds)) {
    events.push({
      at,
      event: "fit-selected",
      runId,
      fitId
    });
  }

  const pyfaRunEvents = [
    ...normalizePyfaRunRows(syncResult?.added, "added"),
    ...normalizePyfaRunRows(syncResult?.skipped, "skipped"),
    ...normalizePyfaRunRows(syncResult?.failed, "failed")
  ].sort((left, right) => comparePyfaRunEvents(left, right));

  for (const row of pyfaRunEvents) {
    events.push({
      at,
      event: "pyfa-run",
      runId,
      fitId: row.fitId,
      status: row.status,
      ...(row.reason ? { reason: row.reason } : {}),
      ...(row.stage ? { stage: row.stage } : {})
    });
  }

  events.push({
    at,
    event: "reference-merged",
    runId,
    referencesBeforeCount: normalizeNonNegativeInteger(syncResult?.referencesBeforeCount, 0),
    referencesAfterCount: normalizeNonNegativeInteger(syncResult?.referencesAfterCount, 0),
    addedCount: Array.isArray(syncResult?.added) ? syncResult.added.length : 0,
    skippedCount: Array.isArray(syncResult?.skipped) ? syncResult.skipped.length : 0,
    failedCount: Array.isArray(syncResult?.failed) ? syncResult.failed.length : 0
  });

  const comparisons = normalizeComparisons(compareResult?.comparisons);
  for (const comparison of comparisons) {
    events.push({
      at,
      event: "comparison",
      runId,
      fitId: comparison.fitId,
      pass: comparison.pass
    });
  }

  const mismatches = normalizeReportMismatches(compareResult?.mismatches);
  for (const mismatch of mismatches) {
    events.push({
      at,
      event: "mismatch",
      runId,
      fitId: mismatch.fitId,
      deltaCount: mismatch.deltas.length
    });
  }

  const errors = normalizeDiagnosticsErrors({
    syncResult,
    compareResult,
    report
  });
  for (const error of errors) {
    events.push({
      at,
      event: "error",
      runId,
      fitId: error.fitId,
      reason: error.reason,
      ...(error.stage ? { stage: error.stage } : {}),
      ...(error.stderrTail ? { stderrTail: error.stderrTail } : {})
    });
  }

  return events;
}

async function writeJsonFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeJsonlFile(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeJsonl(rows), "utf8");
}

function serializeJsonl(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function normalizeDiagnosticsErrors({ syncResult, compareResult, report }) {
  const rows = [];
  const syncFailures = Array.isArray(syncResult?.failed) ? syncResult.failed : [];
  for (const failure of syncFailures) {
    const fitId = normalizeOptionalString(failure?.fitId);
    if (!fitId) {
      continue;
    }
    rows.push({
      fitId,
      reason: normalizeOptionalString(failure?.reason) ?? "unknown",
      stage: normalizeOptionalString(failure?.stage) ?? undefined,
      stderrTail: normalizeOptionalString(failure?.stderrTail) ?? undefined
    });
  }

  const compareFailures = Array.isArray(compareResult?.failed) ? compareResult.failed : [];
  for (const failure of compareFailures) {
    const fitId = normalizeOptionalString(failure?.fitId);
    if (!fitId) {
      continue;
    }
    rows.push({
      fitId,
      reason: normalizeOptionalString(failure?.reason) ?? "dogma_compute_failed",
      stage: normalizeOptionalString(failure?.stage) ?? undefined,
      stderrTail: normalizeOptionalString(failure?.stderrTail) ?? undefined
    });
  }

  for (const fitId of normalizeFitIds(report?.missingCorpusFitIds)) {
    rows.push({
      fitId,
      reason: "missing_corpus_entry"
    });
  }
  for (const fitId of normalizeFitIds(report?.missingReferenceFitIds)) {
    rows.push({
      fitId,
      reason: "missing_reference_result"
    });
  }

  return rows
    .sort((left, right) => compareStrings(left.fitId, right.fitId) || compareStrings(left.reason, right.reason))
    .filter((row, index, entries) => {
      const previous = entries[index - 1];
      if (!previous) {
        return true;
      }
      return (
        previous.fitId !== row.fitId ||
        previous.reason !== row.reason ||
        previous.stage !== row.stage ||
        previous.stderrTail !== row.stderrTail
      );
    });
}

function normalizeComparisons(comparisons) {
  if (!Array.isArray(comparisons)) {
    return [];
  }
  return comparisons
    .map((comparison) => ({
      fitId: normalizeOptionalString(comparison?.fitId),
      pass: Boolean(comparison?.pass)
    }))
    .filter((row) => Boolean(row.fitId))
    .sort((left, right) => compareStrings(left.fitId, right.fitId));
}

function normalizePyfaRunRows(rows, status) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => ({
      fitId: normalizeOptionalString(row?.fitId),
      status,
      reason: normalizeOptionalString(row?.reason) ?? undefined,
      stage: normalizeOptionalString(row?.stage) ?? undefined
    }))
    .filter((row) => Boolean(row.fitId));
}

function comparePyfaRunEvents(left, right) {
  return (
    compareStrings(left.fitId, right.fitId) ||
    comparePyfaRunEventStatus(left.status, right.status)
  );
}

function comparePyfaRunEventStatus(leftStatus, rightStatus) {
  const left = PYFA_RUN_EVENT_STATUS_ORDER.get(leftStatus) ?? Number.MAX_SAFE_INTEGER;
  const right = PYFA_RUN_EVENT_STATUS_ORDER.get(rightStatus) ?? Number.MAX_SAFE_INTEGER;
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function normalizeReportMismatches(mismatches) {
  if (!Array.isArray(mismatches)) {
    return [];
  }

  return mismatches
    .map((mismatch) => {
      const fitId = normalizeOptionalString(mismatch?.fitId);
      if (!fitId) {
        return null;
      }
      return {
        fitId,
        shipTypeId: normalizeShipTypeId(mismatch),
        deltas: normalizeReportDeltas(mismatch?.deltas)
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareStrings(left.fitId, right.fitId));
}

function normalizeShipTypeId(mismatch) {
  const expectedShipTypeId = normalizePositiveInteger(mismatch?.expected?.shipTypeId);
  if (expectedShipTypeId) {
    return expectedShipTypeId;
  }
  const actualShipTypeId = normalizePositiveInteger(mismatch?.actual?.shipTypeId);
  if (actualShipTypeId) {
    return actualShipTypeId;
  }
  return 0;
}

function normalizeReportDeltas(deltas) {
  if (!Array.isArray(deltas)) {
    return [];
  }

  return deltas
    .map((delta) => {
      const metric = normalizeOptionalString(delta?.metric);
      if (!metric) {
        return null;
      }
      return {
        metric,
        actual: normalizeNumber(delta?.actual),
        expected: normalizeNumber(delta?.expected),
        absDelta: normalizeNonNegativeNumber(delta?.absDelta),
        relDelta: normalizeNonNegativeNumber(delta?.relDelta),
        pass: Boolean(delta?.pass)
      };
    })
    .filter(Boolean);
}

function normalizePyfaFailures(syncFailures) {
  if (!Array.isArray(syncFailures)) {
    return [];
  }

  return syncFailures
    .filter((row) => normalizeOptionalString(row?.reason) === "pyfa_failed")
    .map((row) => {
      const fitId = normalizeOptionalString(row?.fitId);
      if (!fitId) {
        return null;
      }
      return {
        fitId,
        reason: "pyfa_failed",
        ...(normalizeOptionalString(row?.stage)
          ? { stage: normalizeOptionalString(row.stage) }
          : {}),
        ...(normalizeOptionalString(row?.stderrTail)
          ? { stderrTail: normalizeOptionalString(row.stderrTail) }
          : {})
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareStrings(left.fitId, right.fitId));
}

function mergeAndNormalizeFitIds(...fitIdLists) {
  return normalizeFitIds(fitIdLists.flat());
}

function normalizeFitIds(fitIds) {
  if (!Array.isArray(fitIds)) {
    return [];
  }
  const uniqueFitIds = new Set();
  for (const rawFitId of fitIds) {
    const fitId = normalizeOptionalString(rawFitId);
    if (fitId) {
      uniqueFitIds.add(fitId);
    }
  }
  return [...uniqueFitIds].sort(compareStrings);
}

function normalizeGeneratedAt(generatedAt) {
  const normalized = normalizeOptionalString(generatedAt);
  return normalized ?? new Date().toISOString();
}

function normalizeRunId(runId) {
  return normalizeOptionalString(runId) ?? "manual";
}

function normalizeExitCode(exitCode) {
  const numeric = Number(exitCode);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.trunc(numeric);
}

function normalizeNonNegativeInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return fallback;
  }
  return Math.trunc(normalized);
}

function normalizePositiveInteger(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }
  return Math.trunc(normalized);
}

function normalizeNumber(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return normalized;
}

function normalizeNonNegativeNumber(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return 0;
  }
  return normalized;
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

function validateWriteArtifactInput({
  scope,
  syncResult,
  compareResult,
  reportPath,
  diagnosticsPath
}) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    throw new TypeError("scope must be an object.");
  }
  if (!syncResult || typeof syncResult !== "object" || Array.isArray(syncResult)) {
    throw new TypeError("syncResult must be an object.");
  }
  if (!compareResult || typeof compareResult !== "object" || Array.isArray(compareResult)) {
    throw new TypeError("compareResult must be an object.");
  }
  if (!reportPath || typeof reportPath !== "string") {
    throw new TypeError("reportPath must be a non-empty string.");
  }
  if (diagnosticsPath !== undefined && typeof diagnosticsPath !== "string") {
    throw new TypeError("diagnosticsPath must be a string when provided.");
  }
}
