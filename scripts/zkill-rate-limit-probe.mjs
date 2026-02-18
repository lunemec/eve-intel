#!/usr/bin/env node

const DEFAULTS = {
  attempts: 200,
  intervalMs: 0,
  timeoutMs: 12000,
  stopOnStatus: [420, 429],
  userAgent: "eve-intel-zkill-rate-limit-probe/1.0",
  bodyPreviewBytes: 2048
};

function usage() {
  return "Usage: node scripts/zkill-rate-limit-probe.mjs <url> [--attempts N] [--interval-ms N] [--timeout-ms N] [--stop-on-status 420,429] [--user-agent value]";
}

function parseArgs(argv) {
  if (argv.length === 0 || !argv[0]) {
    throw new Error(usage());
  }

  const parsedUrl = new URL(argv[0]);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("URL must be http or https");
  }

  const options = {
    ...DEFAULTS,
    url: parsedUrl.toString()
  };

  let i = 1;
  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }

    const splitIdx = token.indexOf("=");
    const inline = splitIdx >= 0;
    const flag = inline ? token.slice(0, splitIdx) : token;
    const value = inline ? token.slice(splitIdx + 1) : argv[i + 1];

    if (value === undefined) {
      throw new Error(`Missing value for ${flag}`);
    }

    if (flag === "--attempts") {
      options.attempts = toPositiveInt(value, "attempts");
    } else if (flag === "--interval-ms") {
      options.intervalMs = toNonNegativeInt(value, "interval-ms");
    } else if (flag === "--timeout-ms") {
      options.timeoutMs = toPositiveInt(value, "timeout-ms");
    } else if (flag === "--stop-on-status") {
      const statuses = value
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry) && entry >= 100 && entry <= 599);
      if (statuses.length === 0) {
        throw new Error("stop-on-status must include at least one valid HTTP status code");
      }
      options.stopOnStatus = [...new Set(statuses)];
    } else if (flag === "--user-agent") {
      if (value.trim().length === 0) {
        throw new Error("user-agent must not be empty");
      }
      options.userAgent = value;
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }

    i += inline ? 1 : 2;
  }

  return options;
}

function headersToObject(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) {
    out[key] = value;
  }
  return out;
}

function getHeader(headers, key) {
  const target = key.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
}

function deriveRetryHints(headers, nowEpochMs) {
  const retryAfterRaw = getHeader(headers, "retry-after");
  const retryAfterMs = parseRetryAfterMs(retryAfterRaw, nowEpochMs);
  const resetRaw =
    getHeader(headers, "ratelimit-reset") ??
    getHeader(headers, "x-ratelimit-reset") ??
    getHeader(headers, "x-rate-limit-reset") ??
    getHeader(headers, "x-reset");
  const resetMs = parseResetMs(resetRaw, nowEpochMs);
  const maxRequests = parseIntHeader(headers, "x-bin-max-requests");
  const requestCount = parseIntHeader(headers, "x-bin-request-count");
  const remainingRequests =
    maxRequests !== undefined && requestCount !== undefined ? Math.max(0, maxRequests - requestCount) : undefined;

  if (
    retryAfterMs === undefined &&
    resetMs === undefined &&
    maxRequests === undefined &&
    requestCount === undefined
  ) {
    return null;
  }

  return {
    retryAfterMs,
    retryAt: retryAfterMs !== undefined ? new Date(nowEpochMs + retryAfterMs).toISOString() : undefined,
    resetMs,
    resetAt: resetMs !== undefined ? new Date(nowEpochMs + resetMs).toISOString() : undefined,
    maxRequests,
    requestCount,
    remainingRequests
  };
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const started = Date.now();

    try {
      const response = await fetchWithTimeout(
        options.url,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": options.userAgent
          }
        },
        options.timeoutMs
      );

      const bodyText = await response.text();
      const finished = Date.now();
      const bodyBytes = new TextEncoder().encode(bodyText);
      const previewBytes = bodyBytes.slice(0, options.bodyPreviewBytes);
      const headers = headersToObject(response.headers);
      const record = {
        timestamp: new Date(finished).toISOString(),
        attempt,
        url: options.url,
        status: response.status,
        statusText: response.statusText,
        elapsedMs: Math.max(0, finished - started),
        headers,
        bodyPreview: new TextDecoder().decode(previewBytes),
        bodyLength: bodyBytes.length,
        bodyTruncated: bodyBytes.length > previewBytes.length,
        retryHints: deriveRetryHints(headers, finished)
      };

      console.log(JSON.stringify(record));

      if (options.stopOnStatus.includes(response.status)) {
        process.exit(2);
      }

      if (attempt < options.attempts && options.intervalMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
      }
    } catch (error) {
      const finished = Date.now();
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          timestamp: new Date(finished).toISOString(),
          attempt,
          url: options.url,
          elapsedMs: Math.max(0, finished - started),
          error: message
        })
      );
      process.exit(1);
    }
  }

  process.exit(0);
}

function parseRetryAfterMs(raw, nowEpochMs) {
  if (!raw) {
    return undefined;
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.round(numeric * 1000));
  }
  const parsedDate = Date.parse(raw);
  if (Number.isNaN(parsedDate)) {
    return undefined;
  }
  return Math.max(0, parsedDate - nowEpochMs);
}

function parseResetMs(raw, nowEpochMs) {
  if (!raw) {
    return undefined;
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    if (numeric > 1_000_000_000_000) {
      return Math.max(0, Math.round(numeric - nowEpochMs));
    }
    if (numeric > 1_000_000_000) {
      return Math.max(0, Math.round(numeric * 1000 - nowEpochMs));
    }
    return Math.max(0, Math.round(numeric * 1000));
  }
  const parsedDate = Date.parse(raw);
  if (Number.isNaN(parsedDate)) {
    return undefined;
  }
  return Math.max(0, parsedDate - nowEpochMs);
}

function parseIntHeader(headers, name) {
  const raw = getHeader(headers, name);
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toPositiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function toNonNegativeInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
