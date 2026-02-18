import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function parseDogmaNewFitScopeIdFlags(rawValues = []) {
  if (!Array.isArray(rawValues)) {
    throw new TypeError("fit-id flags must be provided as an array.");
  }

  const fitIds = [];
  for (const rawValue of rawValues) {
    const value = String(rawValue ?? "");
    const segments = value.split(",");
    for (const segment of segments) {
      const fitId = segment.trim();
      if (!fitId) {
        continue;
      }
      fitIds.push(fitId);
    }
  }

  return normalizeFitIds(fitIds);
}

export async function resolveDogmaNewFitScope(
  {
    scopeFilePath,
    fitIdFlags = [],
    runId,
    generatedAt,
    source
  } = {},
  { readFileFn = readFile, nowFn = () => new Date().toISOString() } = {}
) {
  let scopeFromFile = null;
  if (scopeFilePath !== undefined && scopeFilePath !== null) {
    if (typeof scopeFilePath !== "string" || scopeFilePath.trim().length === 0) {
      throw new TypeError("scopeFilePath must be a non-empty string when provided.");
    }
    const fileText = await readFileFn(scopeFilePath, "utf8");
    scopeFromFile = normalizeScopeFilePayload(JSON.parse(fileText));
  }

  const flagFitIds = parseDogmaNewFitScopeIdFlags(fitIdFlags);
  const mergedFitIds = normalizeFitIds([...(scopeFromFile?.newFitIds ?? []), ...flagFitIds]);

  const finalRunId =
    normalizeOptionalString(runId) ??
    scopeFromFile?.runId ??
    buildManualRunId(mergedFitIds);

  const finalGeneratedAt =
    normalizeOptionalString(generatedAt) ??
    scopeFromFile?.generatedAt ??
    String(nowFn());

  const finalSource = resolveScopeSource({
    scopeFromFile,
    hasFlagFitIds: flagFitIds.length > 0,
    source
  });

  return {
    runId: finalRunId,
    generatedAt: finalGeneratedAt,
    source: finalSource,
    newFitIds: mergedFitIds
  };
}

function normalizeScopeFilePayload(rawScope) {
  if (!rawScope || typeof rawScope !== "object" || Array.isArray(rawScope)) {
    throw new TypeError("Scope file must contain a JSON object.");
  }

  const runId = normalizeOptionalString(rawScope.runId);
  const generatedAt = normalizeOptionalString(rawScope.generatedAt);
  const source = normalizeOptionalString(rawScope.source);
  if (!runId) {
    throw new TypeError("Scope file runId must be a non-empty string.");
  }
  if (!generatedAt) {
    throw new TypeError("Scope file generatedAt must be a non-empty string.");
  }
  if (!source) {
    throw new TypeError("Scope file source must be a non-empty string.");
  }
  if (!Array.isArray(rawScope.newFitIds)) {
    throw new TypeError("Scope file newFitIds must be an array.");
  }

  return {
    runId,
    generatedAt,
    source,
    newFitIds: normalizeFitIds(rawScope.newFitIds)
  };
}

function resolveScopeSource({ scopeFromFile, hasFlagFitIds, source }) {
  const manualSource = normalizeOptionalString(source) ?? "manual-flags";
  if (!scopeFromFile) {
    return manualSource;
  }
  if (hasFlagFitIds) {
    return "scope-file+manual-flags";
  }
  return scopeFromFile.source;
}

function buildManualRunId(fitIds) {
  const canonicalIds = fitIds.join("\n");
  const hash = createHash("sha256").update(canonicalIds).digest("hex").slice(0, 12);
  return `manual-flags-${hash}`;
}

function normalizeFitIds(fitIds) {
  const normalized = new Set();
  for (const rawFitId of fitIds) {
    const fitId = normalizeOptionalString(rawFitId);
    if (!fitId) {
      continue;
    }
    normalized.add(fitId);
  }

  return [...normalized].sort(compareStrings);
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
