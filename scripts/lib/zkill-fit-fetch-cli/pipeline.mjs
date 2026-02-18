import { collectZkillLossCandidates } from "./pagination.mjs";
import { normalizeZkillFittedItems } from "./normalize.mjs";
import { computeCanonicalFitHash, dedupeFitRecords } from "./dedupe.mjs";
import { writeFetchZkillFitArtifacts } from "./artifacts.mjs";
import { executeWithRetry, isRetryableError } from "./retry.mjs";

const DEFAULT_ZKILL_API_BASE_URL = "https://zkillboard.com/api";
const DEFAULT_ESI_API_BASE_URL = "https://esi.evetech.net/latest";

export async function runFetchZkillFitPipeline(config, dependencies = {}) {
  const normalizedConfig = normalizeConfig(config);
  validateDependencies(dependencies);

  const generatedAt = normalizedConfig.generatedAt ?? new Date().toISOString();
  const fetchImpl = resolveFetchImplementation(dependencies.fetchImpl);
  const executeWithRetryFn = dependencies.executeWithRetryFn ?? executeWithRetry;

  const fetchShipTypeLossPage =
    dependencies.fetchShipTypeLossPage ??
    createZkillLossPageFetcher({
      fetchImpl,
      executeWithRetryFn,
      retryPolicy: normalizedConfig.retryPolicy,
      requestTimeoutMs: normalizedConfig.requestTimeoutMs,
      zkillApiBaseUrl: dependencies.zkillApiBaseUrl ?? DEFAULT_ZKILL_API_BASE_URL
    });

  const fetchEsiKillmail =
    dependencies.fetchEsiKillmail ??
    createEsiKillmailFetcher({
      fetchImpl,
      executeWithRetryFn,
      retryPolicy: normalizedConfig.retryPolicy,
      requestTimeoutMs: normalizedConfig.requestTimeoutMs,
      esiApiBaseUrl: dependencies.esiApiBaseUrl ?? DEFAULT_ESI_API_BASE_URL
    });

  const errors = [];
  const candidates = await collectZkillLossCandidates({
    shipTypeIds: normalizedConfig.shipTypeIds,
    maxRecords: normalizedConfig.maxRecords,
    beforeKillmailId: normalizedConfig.beforeKillmailId,
    fetchShipTypeLossPage: async ({ shipTypeId, page }) => {
      try {
        const pageEntries = await fetchShipTypeLossPage({ shipTypeId, page });
        if (!Array.isArray(pageEntries)) {
          throw new TypeError("zKill ship-type page response must be a JSON array.");
        }
        return pageEntries;
      } catch (error) {
        errors.push(
          toStructuredPipelineError({
            stage: "zkill_fetch",
            errorCode: "ZKILL_FETCH_FAILED",
            shipTypeId,
            error
          })
        );
        return [];
      }
    }
  });

  const assembledRecords = [];
  for (const candidate of candidates) {
    let esiKillmail;
    try {
      const killmailHash = normalizeHash(candidate.killmailHash);
      if (!killmailHash) {
        throw new TypeError("Killmail hash is required for ESI hydration.");
      }
      esiKillmail = await fetchEsiKillmail({
        killmailId: candidate.killmailId,
        killmailHash,
        shipTypeId: candidate.shipTypeFilterId
      });
    } catch (error) {
      errors.push(
        toStructuredPipelineError({
          stage: "esi_fetch",
          errorCode: "ESI_FETCH_FAILED",
          shipTypeId: candidate.shipTypeFilterId,
          killmailId: candidate.killmailId,
          error
        })
      );
      continue;
    }

    let fit;
    try {
      const shipTypeId = parsePositiveInteger(esiKillmail?.victim?.ship_type_id);
      if (!shipTypeId) {
        throw new TypeError("ESI victim.ship_type_id must be a positive integer.");
      }
      fit = normalizeZkillFittedItems({
        shipTypeId,
        items: esiKillmail?.victim?.items
      });
    } catch (error) {
      errors.push(
        toStructuredPipelineError({
          stage: "normalize",
          errorCode: "NORMALIZE_FAILED",
          shipTypeId: candidate.shipTypeFilterId,
          killmailId: candidate.killmailId,
          error
        })
      );
      continue;
    }

    let fitHash;
    try {
      fitHash = computeCanonicalFitHash(fit);
    } catch (error) {
      errors.push(
        toStructuredPipelineError({
          stage: "normalize",
          errorCode: "NORMALIZE_FAILED",
          shipTypeId: candidate.shipTypeFilterId,
          killmailId: candidate.killmailId,
          error
        })
      );
      continue;
    }

    const killmailTime = resolveKillmailTime(esiKillmail, candidate.zkill);
    if (!killmailTime) {
      errors.push(
        toStructuredPipelineError({
          stage: "normalize",
          errorCode: "NORMALIZE_FAILED",
          shipTypeId: candidate.shipTypeFilterId,
          killmailId: candidate.killmailId,
          error: new TypeError("Unable to resolve killmail_time from ESI/zKill payloads.")
        })
      );
      continue;
    }

    assembledRecords.push({
      recordId: `zkill-${candidate.killmailId}`,
      source: "zkill",
      killmailId: candidate.killmailId,
      killmailTime,
      shipTypeId: fit.shipTypeId,
      shipTypeFilterId: candidate.shipTypeFilterId,
      zkillUrl: `https://zkillboard.com/kill/${candidate.killmailId}/`,
      fit: {
        ...fit,
        fitHash
      },
      raw: {
        zkill: candidate.zkill,
        esi: esiKillmail
      },
      fetchedAt: generatedAt
    });
  }

  const dedupeResult = dedupeFitRecords(assembledRecords);
  const manifest = await writeFetchZkillFitArtifacts({
    outputPath: normalizedConfig.outputPath,
    errorsOutputPath: normalizedConfig.errorsOutputPath,
    manifestOutputPath: normalizedConfig.manifestOutputPath,
    records: dedupeResult.records,
    errors,
    duplicatesSkipped: dedupeResult.duplicatesSkipped,
    input: {
      shipTypeIds: normalizedConfig.shipTypeIds,
      maxRecords: normalizedConfig.maxRecords,
      ...(normalizedConfig.beforeKillmailId
        ? { beforeKillmailId: normalizedConfig.beforeKillmailId }
        : {})
    },
    generatedAt
  });

  return {
    manifest,
    records: dedupeResult.records,
    errors,
    duplicatesSkipped: dedupeResult.duplicatesSkipped,
    candidatesProcessed: candidates.length
  };
}

function createZkillLossPageFetcher({
  fetchImpl,
  executeWithRetryFn,
  retryPolicy,
  requestTimeoutMs,
  zkillApiBaseUrl
}) {
  return async ({ shipTypeId, page }) => {
    const normalizedShipTypeId = parsePositiveInteger(shipTypeId);
    const normalizedPage = parsePositiveInteger(page);
    if (!normalizedShipTypeId || !normalizedPage) {
      throw new TypeError("shipTypeId and page must be positive integers.");
    }

    const requestUrl = `${stripTrailingSlash(
      zkillApiBaseUrl
    )}/losses/shipTypeID/${normalizedShipTypeId}/page/${normalizedPage}/`;

    const payload = await requestJsonWithRetry({
      requestUrl,
      fetchImpl,
      executeWithRetryFn,
      retryPolicy,
      requestTimeoutMs,
      stage: "zkill_fetch"
    });
    if (!Array.isArray(payload)) {
      throw new TypeError("zKill ship-type page response must be a JSON array.");
    }
    return payload;
  };
}

function createEsiKillmailFetcher({
  fetchImpl,
  executeWithRetryFn,
  retryPolicy,
  requestTimeoutMs,
  esiApiBaseUrl
}) {
  return async ({ killmailId, killmailHash }) => {
    const normalizedKillmailId = parsePositiveInteger(killmailId);
    const normalizedHash = normalizeHash(killmailHash);
    if (!normalizedKillmailId || !normalizedHash) {
      throw new TypeError("killmailId and killmailHash are required for ESI hydration.");
    }

    const requestUrl = `${stripTrailingSlash(
      esiApiBaseUrl
    )}/killmails/${normalizedKillmailId}/${encodeURIComponent(
      normalizedHash
    )}/?datasource=tranquility`;

    const payload = await requestJsonWithRetry({
      requestUrl,
      fetchImpl,
      executeWithRetryFn,
      retryPolicy,
      requestTimeoutMs,
      stage: "esi_fetch"
    });
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("ESI killmail response must be a JSON object.");
    }
    return payload;
  };
}

async function requestJsonWithRetry({
  requestUrl,
  fetchImpl,
  executeWithRetryFn,
  retryPolicy,
  requestTimeoutMs,
  stage
}) {
  return executeWithRetryFn({
    retryPolicy,
    requestTimeoutMs,
    request: async ({ attempt, signal }) => {
      let response;
      try {
        response = await fetchImpl(requestUrl, {
          method: "GET",
          headers: {
            Accept: "application/json"
          },
          signal
        });
      } catch (error) {
        annotateAttempt(error, attempt);
        throw error;
      }

      if (!response?.ok) {
        throw createHttpStatusError({
          stage,
          requestUrl,
          status: response?.status,
          statusText: response?.statusText,
          headers: response?.headers,
          attempt
        });
      }

      try {
        return await response.json();
      } catch (error) {
        annotateAttempt(error, attempt);
        throw error;
      }
    }
  });
}

function createHttpStatusError({ stage, requestUrl, status, statusText, headers, attempt }) {
  const label = typeof stage === "string" ? stage : "request";
  const statusCode = Number.isInteger(status) ? status : "unknown";
  const text = typeof statusText === "string" && statusText ? ` ${statusText}` : "";
  const error = new Error(`${label} request failed (${statusCode}${text}) for ${requestUrl}`);
  if (Number.isInteger(status)) {
    error.status = status;
  }
  if (headers) {
    error.headers = headers;
  }
  if (parsePositiveInteger(attempt)) {
    error.attempt = attempt;
  }
  return error;
}

function toStructuredPipelineError({
  stage,
  errorCode,
  shipTypeId,
  killmailId,
  error
}) {
  const headers = normalizeHeaders(error?.headers);
  const status = parsePositiveInteger(error?.status ?? error?.statusCode);
  const attempt = parsePositiveInteger(error?.attempt);

  return {
    stage,
    ...(parsePositiveInteger(shipTypeId) ? { shipTypeId: parsePositiveInteger(shipTypeId) } : {}),
    ...(parsePositiveInteger(killmailId) ? { killmailId: parsePositiveInteger(killmailId) } : {}),
    errorCode,
    message: normalizeErrorMessage(error),
    retryable: isRetryableError(error),
    ...(attempt ? { attempt } : {}),
    ...(status ? { status } : {}),
    ...(headers ? { headers } : {})
  };
}

function normalizeHeaders(headers) {
  if (!headers) {
    return undefined;
  }

  if (typeof headers.forEach === "function") {
    const normalized = {};
    headers.forEach((value, name) => {
      normalized[String(name)] = String(value);
    });
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  if (typeof headers !== "object") {
    return undefined;
  }

  const normalized = {};
  for (const [name, value] of Object.entries(headers)) {
    normalized[String(name)] = String(value);
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function resolveKillmailTime(esiKillmail, zkillKillmail) {
  const esiTime = typeof esiKillmail?.killmail_time === "string" ? esiKillmail.killmail_time : "";
  const zkillTime =
    typeof zkillKillmail?.killmail_time === "string" ? zkillKillmail.killmail_time : "";
  const rawTime = esiTime || zkillTime;
  if (!rawTime) {
    return null;
  }

  const parsed = Date.parse(rawTime);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}

function normalizeErrorMessage(error) {
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "Unknown pipeline failure.";
}

function normalizeConfig(config) {
  if (!config || typeof config !== "object") {
    throw new TypeError("config must be an object.");
  }

  const shipTypeIds = normalizeShipTypeIds(config.shipTypeIds);
  const maxRecords = parsePositiveInteger(config.maxRecords);
  if (!maxRecords) {
    throw new TypeError("config.maxRecords must be a positive integer.");
  }

  const outputPath = normalizePath(config.outputPath, "config.outputPath");
  const errorsOutputPath =
    config.errorsOutputPath === undefined
      ? undefined
      : normalizePath(config.errorsOutputPath, "config.errorsOutputPath");
  const manifestOutputPath =
    config.manifestOutputPath === undefined
      ? undefined
      : normalizePath(config.manifestOutputPath, "config.manifestOutputPath");

  const beforeKillmailId =
    config.beforeKillmailId === undefined ? undefined : parsePositiveInteger(config.beforeKillmailId);
  if (config.beforeKillmailId !== undefined && !beforeKillmailId) {
    throw new TypeError("config.beforeKillmailId must be a positive integer when provided.");
  }

  const requestTimeoutMs = parsePositiveInteger(config.requestTimeoutMs);
  if (!requestTimeoutMs) {
    throw new TypeError("config.requestTimeoutMs must be a positive integer.");
  }

  const retryPolicy = normalizeRetryPolicy(config.retryPolicy);
  const generatedAt =
    config.generatedAt === undefined
      ? undefined
      : normalizeGeneratedAt(config.generatedAt, "config.generatedAt");

  return {
    shipTypeIds,
    outputPath,
    errorsOutputPath,
    manifestOutputPath,
    maxRecords,
    beforeKillmailId,
    retryPolicy,
    requestTimeoutMs,
    generatedAt
  };
}

function validateDependencies(dependencies) {
  if (!dependencies || typeof dependencies !== "object") {
    throw new TypeError("dependencies must be an object.");
  }
  if (
    dependencies.fetchShipTypeLossPage !== undefined &&
    typeof dependencies.fetchShipTypeLossPage !== "function"
  ) {
    throw new TypeError("dependencies.fetchShipTypeLossPage must be a function when provided.");
  }
  if (dependencies.fetchEsiKillmail !== undefined && typeof dependencies.fetchEsiKillmail !== "function") {
    throw new TypeError("dependencies.fetchEsiKillmail must be a function when provided.");
  }
  if (dependencies.fetchImpl !== undefined && typeof dependencies.fetchImpl !== "function") {
    throw new TypeError("dependencies.fetchImpl must be a function when provided.");
  }
  if (
    dependencies.executeWithRetryFn !== undefined &&
    typeof dependencies.executeWithRetryFn !== "function"
  ) {
    throw new TypeError("dependencies.executeWithRetryFn must be a function when provided.");
  }
}

function resolveFetchImplementation(fetchImpl) {
  const resolved = fetchImpl ?? globalThis.fetch;
  if (typeof resolved !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }
  return resolved;
}

function normalizeShipTypeIds(rawShipTypeIds) {
  if (!Array.isArray(rawShipTypeIds) || rawShipTypeIds.length === 0) {
    throw new TypeError("config.shipTypeIds must be a non-empty array.");
  }

  const shipTypeIds = rawShipTypeIds.map((shipTypeId) => parsePositiveInteger(shipTypeId));
  if (shipTypeIds.some((shipTypeId) => !shipTypeId)) {
    throw new TypeError("config.shipTypeIds must contain positive integers.");
  }
  return shipTypeIds;
}

function normalizeRetryPolicy(rawRetryPolicy) {
  if (!rawRetryPolicy || typeof rawRetryPolicy !== "object") {
    throw new TypeError("config.retryPolicy must be an object.");
  }

  const maxAttempts = parsePositiveInteger(rawRetryPolicy.maxAttempts);
  const baseMs = parsePositiveInteger(rawRetryPolicy.baseMs);
  const maxMs = parsePositiveInteger(rawRetryPolicy.maxMs);

  if (!maxAttempts || !baseMs || !maxMs) {
    throw new TypeError(
      "config.retryPolicy.maxAttempts/baseMs/maxMs must all be positive integers."
    );
  }
  if (baseMs > maxMs) {
    throw new TypeError("config.retryPolicy.baseMs must be <= config.retryPolicy.maxMs.");
  }

  return {
    maxAttempts,
    baseMs,
    maxMs
  };
}

function normalizePath(rawPath, fieldName) {
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
  return rawPath;
}

function normalizeGeneratedAt(rawGeneratedAt, fieldName) {
  if (typeof rawGeneratedAt !== "string" || !rawGeneratedAt.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string when provided.`);
  }

  const parsed = Date.parse(rawGeneratedAt);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`${fieldName} must be an ISO-8601 date-time string.`);
  }
  return new Date(parsed).toISOString();
}

function normalizeHash(rawHash) {
  if (typeof rawHash !== "string") {
    return "";
  }
  return rawHash.trim();
}

function annotateAttempt(error, attempt) {
  if (!error || typeof error !== "object") {
    return;
  }
  if (parsePositiveInteger(attempt)) {
    error.attempt = attempt;
  }
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function stripTrailingSlash(url) {
  if (typeof url !== "string" || !url.trim()) {
    return "";
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
