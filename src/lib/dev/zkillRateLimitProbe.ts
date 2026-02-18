export type ProbeOptions = {
  url: string;
  attempts: number;
  intervalMs: number;
  timeoutMs: number;
  stopOnStatus: number[];
  userAgent: string;
  bodyPreviewBytes: number;
};

export type RetryHints = {
  retryAfterMs?: number;
  retryAt?: string;
  resetMs?: number;
  resetAt?: string;
  maxRequests?: number;
  requestCount?: number;
  remainingRequests?: number;
  sources: string[];
};

export type ProbeRecord = {
  timestamp: string;
  attempt: number;
  url: string;
  status: number;
  statusText: string;
  elapsedMs: number;
  headers: Record<string, string>;
  bodyPreview: string;
  bodyLength: number;
  bodyTruncated: boolean;
  retryHints: RetryHints | null;
};

export type ProbeRunDependencies = {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
  logFn?: (line: string) => void;
  errorFn?: (line: string) => void;
};

export const DEFAULT_PROBE_OPTIONS: Omit<ProbeOptions, "url"> = {
  attempts: 200,
  intervalMs: 0,
  timeoutMs: 12000,
  stopOnStatus: [420, 429],
  userAgent: "eve-intel-zkill-rate-limit-probe/1.0",
  bodyPreviewBytes: 2048
};

export function parseProbeArgs(argv: string[]): ProbeOptions {
  if (argv.length === 0 || !argv[0]) {
    throw new Error(
      "Usage: node scripts/zkill-rate-limit-probe.mjs <url> [--attempts N] [--interval-ms N] [--timeout-ms N] [--stop-on-status 420,429] [--user-agent value]"
    );
  }

  const options: ProbeOptions = {
    ...DEFAULT_PROBE_OPTIONS,
    url: parseUrl(argv[0])
  };

  let i = 1;
  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }

    const [rawFlag, inlineValue] = token.split("=", 2);
    const flag = rawFlag;
    const value = inlineValue ?? argv[i + 1];

    if (value === undefined && flag !== "--help") {
      throw new Error(`Missing value for ${flag}`);
    }

    switch (flag) {
      case "--attempts": {
        options.attempts = parsePositiveInteger(value, "attempts");
        break;
      }
      case "--interval-ms": {
        options.intervalMs = parseNonNegativeInteger(value, "interval-ms");
        break;
      }
      case "--timeout-ms": {
        options.timeoutMs = parsePositiveInteger(value, "timeout-ms");
        break;
      }
      case "--stop-on-status": {
        const statuses = value
          .split(",")
          .map((entry) => Number(entry.trim()))
          .filter((entry) => Number.isInteger(entry) && entry >= 100 && entry <= 599);
        if (statuses.length === 0) {
          throw new Error("stop-on-status must include at least one valid HTTP status code");
        }
        options.stopOnStatus = [...new Set(statuses)];
        break;
      }
      case "--user-agent": {
        if (value.trim().length === 0) {
          throw new Error("user-agent must not be empty");
        }
        options.userAgent = value;
        break;
      }
      default:
        throw new Error(`Unknown option: ${flag}`);
    }

    i += inlineValue === undefined ? 2 : 1;
  }

  return options;
}

export function headersToObject(headers: Headers | Record<string, string>): Record<string, string> {
  if (headers instanceof Headers) {
    const output: Record<string, string> = {};
    for (const [key, value] of headers.entries()) {
      output[key] = value;
    }
    return output;
  }

  return { ...headers };
}

export function deriveRetryHints(headersInput: Headers | Record<string, string>, nowEpochMs = Date.now()): RetryHints | null {
  const headers = headersToObject(headersInput);
  const sources = new Set<string>();

  const retryAfterValue = getHeader(headers, "retry-after");
  const retryAfterMs = parseRetryAfterMs(retryAfterValue, nowEpochMs);
  if (retryAfterMs !== undefined) {
    sources.add("retry-after");
  }

  const resetValue =
    getHeader(headers, "ratelimit-reset") ??
    getHeader(headers, "x-ratelimit-reset") ??
    getHeader(headers, "x-rate-limit-reset") ??
    getHeader(headers, "x-reset");
  const resetMs = parseResetMs(resetValue, nowEpochMs);
  if (resetMs !== undefined) {
    sources.add("reset");
  }

  const maxRequests = parseIntegerHeader(headers, "x-bin-max-requests");
  if (maxRequests !== undefined) {
    sources.add("x-bin-max-requests");
  }

  const requestCount = parseIntegerHeader(headers, "x-bin-request-count");
  if (requestCount !== undefined) {
    sources.add("x-bin-request-count");
  }

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
    remainingRequests,
    sources: [...sources]
  };
}

export function formatProbeRecord(params: {
  timestamp: string;
  attempt: number;
  url: string;
  status: number;
  statusText: string;
  elapsedMs: number;
  headers: Headers | Record<string, string>;
  bodyText: string;
  bodyPreviewBytes?: number;
  nowEpochMs?: number;
}): ProbeRecord {
  const bodyPreviewBytes = params.bodyPreviewBytes ?? DEFAULT_PROBE_OPTIONS.bodyPreviewBytes;
  const body = encodeText(params.bodyText);
  const truncatedBody = body.slice(0, bodyPreviewBytes);
  const bodyPreview = decodeBytes(truncatedBody);
  const headersObject = headersToObject(params.headers);

  return {
    timestamp: params.timestamp,
    attempt: params.attempt,
    url: params.url,
    status: params.status,
    statusText: params.statusText,
    elapsedMs: params.elapsedMs,
    headers: headersObject,
    bodyPreview,
    bodyLength: body.length,
    bodyTruncated: body.length > truncatedBody.length,
    retryHints: deriveRetryHints(headersObject, params.nowEpochMs)
  };
}

export async function runProbe(options: ProbeOptions, deps: ProbeRunDependencies = {}): Promise<number> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleepFn = deps.sleepFn ?? sleep;
  const nowFn = deps.nowFn ?? Date.now;
  const logFn = deps.logFn ?? ((line: string) => console.log(line));
  const errorFn = deps.errorFn ?? ((line: string) => console.error(line));

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const started = nowFn();

    try {
      const response = await fetchWithTimeout(fetchFn, options.url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": options.userAgent
        }
      }, options.timeoutMs);

      const bodyText = await response.text();
      const finished = nowFn();
      const record = formatProbeRecord({
        timestamp: new Date(finished).toISOString(),
        attempt,
        url: options.url,
        status: response.status,
        statusText: response.statusText,
        elapsedMs: Math.max(0, finished - started),
        headers: response.headers,
        bodyText,
        bodyPreviewBytes: options.bodyPreviewBytes,
        nowEpochMs: finished
      });

      logFn(JSON.stringify(record));

      if (options.stopOnStatus.includes(response.status)) {
        return 2;
      }

      if (attempt < options.attempts && options.intervalMs > 0) {
        await sleepFn(options.intervalMs);
      }
    } catch (error) {
      const finished = nowFn();
      const message = error instanceof Error ? error.message : String(error);
      errorFn(
        JSON.stringify({
          timestamp: new Date(finished).toISOString(),
          attempt,
          url: options.url,
          elapsedMs: Math.max(0, finished - started),
          error: message
        })
      );
      return 1;
    }
  }

  return 0;
}

function parseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must be http or https");
  }
  return parsed.toString();
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

function getHeader(headers: Record<string, string>, key: string): string | undefined {
  const target = key.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
}

function parseIntegerHeader(headers: Record<string, string>, key: string): number | undefined {
  const raw = getHeader(headers, key);
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseRetryAfterMs(raw: string | undefined, nowEpochMs: number): number | undefined {
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

function parseResetMs(raw: string | undefined, nowEpochMs: number): number | undefined {
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

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeBytes(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
