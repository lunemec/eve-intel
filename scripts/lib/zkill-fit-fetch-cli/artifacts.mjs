import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ERROR_STAGES = new Set(["zkill_fetch", "esi_fetch", "normalize", "write"]);

export async function writeFetchZkillFitArtifacts({
  outputPath,
  records,
  errors = [],
  errorsOutputPath,
  manifestOutputPath,
  input,
  duplicatesSkipped = 0,
  generatedAt = new Date().toISOString()
}) {
  validateArtifactInput({
    outputPath,
    records,
    errors,
    errorsOutputPath,
    manifestOutputPath,
    input,
    duplicatesSkipped,
    generatedAt
  });

  await writeJsonlFile(outputPath, records);

  const structuredErrors = errors.map((error) => toStructuredErrorRecord(error, generatedAt));
  if (errorsOutputPath) {
    await writeJsonlFile(errorsOutputPath, structuredErrors);
  }

  const manifest = buildFetchZkillRunManifest({
    generatedAt,
    input,
    records,
    duplicatesSkipped,
    errorsLogged: structuredErrors.length
  });

  if (manifestOutputPath) {
    await writeJsonFile(manifestOutputPath, manifest);
  }

  return manifest;
}

export function buildFetchZkillRunManifest({
  generatedAt,
  input,
  records,
  duplicatesSkipped,
  errorsLogged
}) {
  const killmailIds = records
    .map((record) => parsePositiveInteger(record?.killmailId))
    .filter((killmailId) => Boolean(killmailId));

  const newestKillmailId = killmailIds.length > 0 ? Math.max(...killmailIds) : undefined;
  const oldestKillmailId = killmailIds.length > 0 ? Math.min(...killmailIds) : undefined;

  return {
    generatedAt,
    input: {
      shipTypeIds: [...input.shipTypeIds],
      maxRecords: input.maxRecords,
      ...(input.beforeKillmailId ? { beforeKillmailId: input.beforeKillmailId } : {})
    },
    output: {
      recordsWritten: records.length,
      duplicatesSkipped,
      errorsLogged
    },
    paging: {
      ...(newestKillmailId ? { newestKillmailId } : {}),
      ...(oldestKillmailId ? { oldestKillmailId } : {}),
      ...(oldestKillmailId ? { nextBeforeKillmailId: oldestKillmailId } : {})
    }
  };
}

function toStructuredErrorRecord(error, at) {
  const stage = normalizeErrorStage(error?.stage);
  const shipTypeId = parsePositiveInteger(error?.shipTypeId);
  const killmailId = parsePositiveInteger(error?.killmailId);
  const attempt = parsePositiveInteger(error?.attempt);
  const status = parsePositiveInteger(error?.status);
  const message = String(error?.message ?? "Unknown error");
  const errorCode = normalizeErrorCode(error?.errorCode);
  const retryable = Boolean(error?.retryable);
  const headers = normalizeHeaders(error?.headers);

  return {
    at,
    stage,
    ...(shipTypeId ? { shipTypeId } : {}),
    ...(killmailId ? { killmailId } : {}),
    errorCode,
    message,
    retryable,
    ...(attempt ? { attempt } : {}),
    ...(status ? { status } : {}),
    ...(headers ? { headers } : {})
  };
}

async function writeJsonlFile(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeJsonl(rows), "utf8");
}

async function writeJsonFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function serializeJsonl(rows) {
  if (rows.length === 0) {
    return "";
  }
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function validateArtifactInput({
  outputPath,
  records,
  errors,
  errorsOutputPath,
  manifestOutputPath,
  input,
  duplicatesSkipped,
  generatedAt
}) {
  if (!outputPath || typeof outputPath !== "string") {
    throw new TypeError("outputPath must be a non-empty string.");
  }
  if (!Array.isArray(records)) {
    throw new TypeError("records must be an array.");
  }
  if (!Array.isArray(errors)) {
    throw new TypeError("errors must be an array.");
  }
  if (errorsOutputPath !== undefined && typeof errorsOutputPath !== "string") {
    throw new TypeError("errorsOutputPath must be a string when provided.");
  }
  if (manifestOutputPath !== undefined && typeof manifestOutputPath !== "string") {
    throw new TypeError("manifestOutputPath must be a string when provided.");
  }
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object.");
  }
  if (!Array.isArray(input.shipTypeIds) || input.shipTypeIds.length === 0) {
    throw new TypeError("input.shipTypeIds must be a non-empty array.");
  }
  for (const shipTypeId of input.shipTypeIds) {
    if (!parsePositiveInteger(shipTypeId)) {
      throw new TypeError("input.shipTypeIds must contain positive integers.");
    }
  }
  if (!parsePositiveInteger(input.maxRecords)) {
    throw new TypeError("input.maxRecords must be a positive integer.");
  }
  if (
    input.beforeKillmailId !== undefined &&
    !parsePositiveInteger(input.beforeKillmailId)
  ) {
    throw new TypeError("input.beforeKillmailId must be a positive integer when provided.");
  }
  if (!parseNonNegativeInteger(duplicatesSkipped) && duplicatesSkipped !== 0) {
    throw new TypeError("duplicatesSkipped must be a non-negative integer.");
  }
  if (!generatedAt || typeof generatedAt !== "string") {
    throw new TypeError("generatedAt must be a non-empty string.");
  }
}

function normalizeErrorStage(rawStage) {
  const stage = typeof rawStage === "string" ? rawStage.trim() : "";
  if (ERROR_STAGES.has(stage)) {
    return stage;
  }
  return "normalize";
}

function normalizeErrorCode(rawCode) {
  const errorCode = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!errorCode) {
    return "UNKNOWN_ERROR";
  }
  return errorCode.toUpperCase();
}

function normalizeHeaders(rawHeaders) {
  if (!rawHeaders || typeof rawHeaders !== "object") {
    return undefined;
  }

  const headers = {};
  for (const [name, value] of Object.entries(rawHeaders)) {
    headers[String(name)] = String(value);
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}
