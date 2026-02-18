export const DEFAULT_MAX_RECORDS = 200;
export const DEFAULT_RETRY_MAX_ATTEMPTS = 5;
export const DEFAULT_RETRY_BASE_MS = 1000;
export const DEFAULT_RETRY_MAX_MS = 30000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

export class FetchZkillFitsCliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "FetchZkillFitsCliUsageError";
  }
}

export function formatFetchZkillFitsUsage() {
  return [
    "Usage: node scripts/fetch-zkill-fits.mjs --ship-type-ids <csv> --output <path> [options]",
    "",
    "Required:",
    "  --ship-type-ids <csv>       Comma-separated numeric ship type IDs.",
    "  --output <path>             JSONL output path for fit payload records.",
    "",
    "Optional:",
    `  --max-records <n>           Max records to emit (default ${DEFAULT_MAX_RECORDS}).`,
    "  --before-killmail-id <id>   Emit only records where killmailId is below this cursor.",
    "  --errors-output <path>      JSONL output path for structured recoverable errors.",
    "  --manifest-output <path>    JSON output path for run manifest.",
    `  --retry-max-attempts <n>    Retry cap for transient HTTP failures (default ${DEFAULT_RETRY_MAX_ATTEMPTS}).`,
    `  --retry-base-ms <n>         Base fallback backoff delay ms (default ${DEFAULT_RETRY_BASE_MS}).`,
    `  --retry-max-ms <n>          Max fallback backoff delay ms (default ${DEFAULT_RETRY_MAX_MS}).`,
    `  --request-timeout-ms <n>    Per-request timeout in ms (default ${DEFAULT_REQUEST_TIMEOUT_MS}).`,
    "  --help                      Print this help text."
  ].join("\n");
}

export function parseFetchZkillFitsArgs(argv) {
  const raw = {
    shipTypeIds: "",
    outputPath: "",
    errorsOutputPath: undefined,
    manifestOutputPath: undefined,
    maxRecords: DEFAULT_MAX_RECORDS,
    beforeKillmailId: undefined,
    retryMaxAttempts: DEFAULT_RETRY_MAX_ATTEMPTS,
    retryBaseMs: DEFAULT_RETRY_BASE_MS,
    retryMaxMs: DEFAULT_RETRY_MAX_MS,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    help: false
  };

  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    switch (token) {
      case "--help":
      case "-h":
        raw.help = true;
        break;
      case "--ship-type-ids":
        raw.shipTypeIds = nextValue(args, i, token);
        i += 1;
        break;
      case "--output":
        raw.outputPath = nextValue(args, i, token);
        i += 1;
        break;
      case "--errors-output":
        raw.errorsOutputPath = nextValue(args, i, token);
        i += 1;
        break;
      case "--manifest-output":
        raw.manifestOutputPath = nextValue(args, i, token);
        i += 1;
        break;
      case "--max-records":
        raw.maxRecords = parsePositiveInteger(nextValue(args, i, token), token);
        i += 1;
        break;
      case "--before-killmail-id":
        raw.beforeKillmailId = parsePositiveInteger(nextValue(args, i, token), token);
        i += 1;
        break;
      case "--retry-max-attempts":
        raw.retryMaxAttempts = parsePositiveInteger(nextValue(args, i, token), token);
        i += 1;
        break;
      case "--retry-base-ms":
        raw.retryBaseMs = parsePositiveInteger(nextValue(args, i, token), token);
        i += 1;
        break;
      case "--retry-max-ms":
        raw.retryMaxMs = parsePositiveInteger(nextValue(args, i, token), token);
        i += 1;
        break;
      case "--request-timeout-ms":
        raw.requestTimeoutMs = parsePositiveInteger(nextValue(args, i, token), token);
        i += 1;
        break;
      default:
        throw new FetchZkillFitsCliUsageError(`Unknown argument: ${token}`);
    }
  }

  if (raw.help) {
    return { help: true };
  }

  const shipTypeIds = parseShipTypeIds(raw.shipTypeIds);
  if (!raw.outputPath) {
    throw new FetchZkillFitsCliUsageError("--output is required.");
  }
  if (raw.retryBaseMs > raw.retryMaxMs) {
    throw new FetchZkillFitsCliUsageError("--retry-base-ms must be <= --retry-max-ms.");
  }

  return {
    help: false,
    shipTypeIds,
    outputPath: raw.outputPath,
    errorsOutputPath: raw.errorsOutputPath,
    manifestOutputPath: raw.manifestOutputPath,
    maxRecords: raw.maxRecords,
    beforeKillmailId: raw.beforeKillmailId,
    retryPolicy: {
      maxAttempts: raw.retryMaxAttempts,
      baseMs: raw.retryBaseMs,
      maxMs: raw.retryMaxMs
    },
    requestTimeoutMs: raw.requestTimeoutMs
  };
}

function parseShipTypeIds(value) {
  if (!value || !value.trim()) {
    throw new FetchZkillFitsCliUsageError("--ship-type-ids is required.");
  }

  const seen = new Set();
  const parsed = [];
  for (const token of value.split(",")) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const parsedValue = parsePositiveInteger(trimmed, "--ship-type-ids");
    if (seen.has(parsedValue)) continue;
    seen.add(parsedValue);
    parsed.push(parsedValue);
  }

  if (parsed.length === 0) {
    throw new FetchZkillFitsCliUsageError("--ship-type-ids must include at least one numeric ID.");
  }

  return parsed;
}

function parsePositiveInteger(rawValue, flagName) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new FetchZkillFitsCliUsageError(`${flagName} must be a positive integer.`);
  }
  return parsed;
}

function nextValue(args, index, flagName) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new FetchZkillFitsCliUsageError(`${flagName} requires a value.`);
  }
  return value;
}
