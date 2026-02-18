import { createHash } from "node:crypto";
import { normalizeEft, runPyfaLocal } from "../../../tools/parity/pyfa-adapter/index.mjs";

const DEFAULT_PYFA_TIMEOUT_MS = Number(process.env.DOGMA_PARITY_PYFA_TIMEOUT_MS ?? 60_000);
const DEFAULT_PYFA_HARD_KILL_MS = Number(process.env.DOGMA_PARITY_PYFA_HARD_KILL_MS ?? 150_000);

export async function syncDogmaParityReferencesForScope(
  {
    newFitIds = [],
    corpusEntries = [],
    referenceFits = [],
    sdeVersion = "unknown",
    pythonBin = "",
    timeoutMs = DEFAULT_PYFA_TIMEOUT_MS,
    hardKillMs = DEFAULT_PYFA_HARD_KILL_MS,
    debug = false
  } = {},
  {
    runPyfaForFit = runPyfaLocal,
    normalizeEftFn = normalizeEft
  } = {}
) {
  if (!Array.isArray(corpusEntries)) {
    throw new TypeError("corpusEntries must be an array.");
  }
  if (!Array.isArray(referenceFits)) {
    throw new TypeError("referenceFits must be an array.");
  }
  if (typeof runPyfaForFit !== "function") {
    throw new TypeError("runPyfaForFit must be a function.");
  }
  if (typeof normalizeEftFn !== "function") {
    throw new TypeError("normalizeEftFn must be a function.");
  }

  const scopedFitIds = normalizeFitIds(newFitIds);
  const corpusByFitId = buildByFitIdMap(corpusEntries);
  const referencesByFitId = buildByFitIdMap(referenceFits);
  const referencesBeforeCount = referencesByFitId.size;
  const normalizedTimeoutMs = normalizeNonNegativeInteger(timeoutMs, DEFAULT_PYFA_TIMEOUT_MS);
  const normalizedHardKillMs = normalizeNonNegativeInteger(hardKillMs, DEFAULT_PYFA_HARD_KILL_MS);

  const added = [];
  const skipped = [];
  const failed = [];

  for (const fitId of scopedFitIds) {
    if (referencesByFitId.has(fitId)) {
      skipped.push({ fitId, reason: "already_present" });
      continue;
    }

    const corpusEntry = corpusByFitId.get(fitId);
    if (!corpusEntry) {
      failed.push({ fitId, reason: "missing_corpus_entry" });
      continue;
    }

    try {
      const pyfaResult = await runPyfaForFit({
        fitId,
        shipTypeId: corpusEntry.shipTypeId,
        eft: corpusEntry.eft,
        sdeVersion,
        pythonBin: normalizeOptionalString(pythonBin) ?? undefined,
        timeoutMs: normalizedTimeoutMs,
        hardKillMs: normalizedHardKillMs,
        debug
      });

      referencesByFitId.set(
        fitId,
        toReferenceFit({
          fitId,
          corpusEntry,
          pyfaResult,
          sdeVersion
        })
      );
      added.push({ fitId, source: "pyfa" });
    } catch (error) {
      const details = toErrorDetails(error);
      failed.push({
        fitId,
        reason: "pyfa_failed",
        error: String(error?.message ?? error),
        runner: normalizeOptionalString(details.runner) ?? "local-python",
        pythonBin: normalizeOptionalString(details.pythonBin) ?? normalizeOptionalString(pythonBin) ?? "auto",
        timeoutMs: normalizeNonNegativeInteger(details.timeoutMs, normalizedTimeoutMs),
        hardKillMs: normalizeNonNegativeInteger(details.hardKillMs, normalizedHardKillMs),
        stage: normalizeOptionalString(details.stage) ?? "runtime_error",
        elapsedMs: normalizeNonNegativeInteger(details.elapsedMs, 0),
        stdoutTail: normalizeOptionalString(details.stdoutTail) ?? "",
        stderrTail: normalizeOptionalString(details.stderrTail) ?? "",
        normalizedEftHash: resolveNormalizedEftHash({
          details,
          corpusEntry,
          normalizeEftFn
        })
      });
    }
  }

  const mergedReferenceFits = [...referencesByFitId.values()].sort(compareByFitId);
  return {
    scopedFitIds,
    scopedFitCount: scopedFitIds.length,
    referencesBeforeCount,
    referencesAfterCount: mergedReferenceFits.length,
    added,
    skipped,
    failed,
    pyfaFailureCount: failed.filter((row) => row.reason === "pyfa_failed").length,
    missingCorpusFitIds: failed
      .filter((row) => row.reason === "missing_corpus_entry")
      .map((row) => row.fitId),
    mergedReferenceFits
  };
}

function toReferenceFit({ fitId, corpusEntry, pyfaResult, sdeVersion }) {
  return {
    fitId,
    shipTypeId: Number(corpusEntry.shipTypeId),
    source: "pyfa",
    sdeVersion,
    dpsTotal: round(pyfaResult?.dpsTotal),
    alpha: round(pyfaResult?.alpha),
    ehp: round(pyfaResult?.ehp),
    resists: normalizeResists(pyfaResult?.resists),
    metadata: {
      ...normalizeOptionalObject(pyfaResult?.metadata),
      referenceMethod: "pyfa-auto",
      origin: corpusEntry.origin,
      tags: Array.isArray(corpusEntry.tags) ? corpusEntry.tags.join(",") : ""
    }
  };
}

function normalizeResists(resists) {
  return {
    shield: normalizeResistLayer(resists?.shield),
    armor: normalizeResistLayer(resists?.armor),
    hull: normalizeResistLayer(resists?.hull)
  };
}

function normalizeResistLayer(layer) {
  return {
    em: Number(layer?.em ?? 0),
    therm: Number(layer?.therm ?? 0),
    kin: Number(layer?.kin ?? 0),
    exp: Number(layer?.exp ?? 0)
  };
}

function toErrorDetails(error) {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return {};
  }
  const details = error.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }
  return details;
}

function resolveNormalizedEftHash({ details, corpusEntry, normalizeEftFn }) {
  const fromError = normalizeOptionalString(details.normalizedEftHash);
  if (fromError) {
    return fromError;
  }
  try {
    const normalized = normalizeEftFn(String(corpusEntry?.eft ?? ""));
    return sha256(normalized.normalized);
  } catch {
    return sha256(String(corpusEntry?.eft ?? ""));
  }
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

function normalizeOptionalObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNonNegativeInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return fallback;
  }
  return Math.trunc(normalized);
}

function round(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(4));
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function compareByFitId(left, right) {
  return compareStrings(String(left?.fitId ?? ""), String(right?.fitId ?? ""));
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
