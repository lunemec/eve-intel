const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ABORT_ERR",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_BODY_TIMEOUT"
]);

export async function executeWithRetry({
  request,
  retryPolicy,
  requestTimeoutMs,
  sleep = defaultSleep,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) {
  validateInput({
    request,
    retryPolicy,
    requestTimeoutMs,
    sleep,
    now,
    setTimeoutFn,
    clearTimeoutFn
  });

  let attempt = 0;
  while (attempt < retryPolicy.maxAttempts) {
    attempt += 1;
    try {
      return await executeAttempt({
        request,
        attempt,
        requestTimeoutMs,
        setTimeoutFn,
        clearTimeoutFn
      });
    } catch (error) {
      const retryable = isRetryableError(error);
      if (!retryable || attempt >= retryPolicy.maxAttempts) {
        throw error;
      }

      const delayMs = computeRetryDelayMs({
        attempt,
        error,
        retryPolicy,
        now
      });
      await sleep(delayMs);
    }
  }

  throw new Error("Unreachable retry state.");
}

export function computeRetryDelayMs({ attempt, error, retryPolicy, now = () => Date.now() }) {
  const headerDelay = resolveHeaderDelayMs({ headers: error?.headers, now });
  if (Number.isFinite(headerDelay)) {
    return headerDelay;
  }
  return computeFallbackDelayMs({ attempt, retryPolicy });
}

export function isRetryableError(error) {
  if (error?.retryable === true) {
    return true;
  }
  if (error?.retryable === false) {
    return false;
  }

  if (error?.name === "AbortError") {
    return true;
  }

  const code = typeof error?.code === "string" ? error.code.toUpperCase() : "";
  if (RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  const status = Number(error?.status ?? error?.statusCode);
  if (Number.isInteger(status) && RETRYABLE_HTTP_STATUSES.has(status)) {
    return true;
  }

  return false;
}

async function executeAttempt({
  request,
  attempt,
  requestTimeoutMs,
  setTimeoutFn,
  clearTimeoutFn
}) {
  const abortController = new AbortController();
  let timeoutId;

  if (requestTimeoutMs > 0) {
    timeoutId = setTimeoutFn(() => {
      abortController.abort();
    }, requestTimeoutMs);
  }

  try {
    return await request({
      attempt,
      signal: abortController.signal
    });
  } finally {
    if (timeoutId !== undefined) {
      clearTimeoutFn(timeoutId);
    }
  }
}

function resolveHeaderDelayMs({ headers, now }) {
  const retryAfter = getHeaderValue(headers, "retry-after");
  const retryAfterDelay = parseRetryAfterMs(retryAfter, now);
  if (retryAfterDelay !== undefined) {
    return retryAfterDelay;
  }

  const resetAfterHeader =
    getHeaderValue(headers, "ratelimit-reset-after") ??
    getHeaderValue(headers, "x-ratelimit-reset-after");
  const resetAfterDelay = parseSecondsHeaderMs(resetAfterHeader);
  if (resetAfterDelay !== undefined) {
    return resetAfterDelay;
  }

  const resetHeader =
    getHeaderValue(headers, "ratelimit-reset") ?? getHeaderValue(headers, "x-ratelimit-reset");
  const resetDelay = parseResetHeaderMs(resetHeader, now);
  if (resetDelay !== undefined) {
    return resetDelay;
  }

  return undefined;
}

function computeFallbackDelayMs({ attempt, retryPolicy }) {
  const exponent = Math.max(0, attempt - 1);
  const uncapped = retryPolicy.baseMs * 2 ** exponent;
  return Math.min(retryPolicy.maxMs, uncapped);
}

function parseRetryAfterMs(value, now) {
  if (value === undefined) {
    return undefined;
  }

  const secondsDelay = parseSecondsHeaderMs(value);
  if (secondsDelay !== undefined) {
    return secondsDelay;
  }

  const parsedDate = Date.parse(String(value).trim());
  if (Number.isNaN(parsedDate)) {
    return undefined;
  }
  return Math.max(0, parsedDate - now());
}

function parseResetHeaderMs(value, now) {
  const numeric = parseHeaderNumber(value);
  if (numeric === undefined) {
    return undefined;
  }

  if (numeric >= 1_000_000_000) {
    return Math.max(0, Math.round(numeric * 1000 - now()));
  }

  return Math.max(0, Math.round(numeric * 1000));
}

function parseSecondsHeaderMs(value) {
  const numeric = parseHeaderNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  return Math.max(0, Math.round(numeric * 1000));
}

function parseHeaderNumber(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const raw = String(value).trim();
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function getHeaderValue(headers, name) {
  if (!headers) {
    return undefined;
  }

  const normalizedName = name.toLowerCase();
  if (typeof headers.get === "function") {
    const value = headers.get(normalizedName) ?? headers.get(name);
    return value ?? undefined;
  }

  if (typeof headers !== "object") {
    return undefined;
  }

  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (String(headerName).toLowerCase() === normalizedName) {
      return headerValue;
    }
  }

  return undefined;
}

function validateInput({
  request,
  retryPolicy,
  requestTimeoutMs,
  sleep,
  now,
  setTimeoutFn,
  clearTimeoutFn
}) {
  if (typeof request !== "function") {
    throw new TypeError("request must be a function.");
  }
  if (!retryPolicy || typeof retryPolicy !== "object") {
    throw new TypeError("retryPolicy must be an object.");
  }
  if (!isPositiveInteger(retryPolicy.maxAttempts)) {
    throw new TypeError("retryPolicy.maxAttempts must be a positive integer.");
  }
  if (!isPositiveInteger(retryPolicy.baseMs)) {
    throw new TypeError("retryPolicy.baseMs must be a positive integer.");
  }
  if (!isPositiveInteger(retryPolicy.maxMs)) {
    throw new TypeError("retryPolicy.maxMs must be a positive integer.");
  }
  if (retryPolicy.baseMs > retryPolicy.maxMs) {
    throw new TypeError("retryPolicy.baseMs must be <= retryPolicy.maxMs.");
  }
  if (!isPositiveInteger(requestTimeoutMs)) {
    throw new TypeError("requestTimeoutMs must be a positive integer.");
  }
  if (typeof sleep !== "function") {
    throw new TypeError("sleep must be a function.");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }
  if (typeof setTimeoutFn !== "function") {
    throw new TypeError("setTimeoutFn must be a function.");
  }
  if (typeof clearTimeoutFn !== "function") {
    throw new TypeError("clearTimeoutFn must be a function.");
  }
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function defaultSleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
