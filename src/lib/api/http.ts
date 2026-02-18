const DEFAULT_TIMEOUT_MS = 9000;
const DEFAULT_RETRIES = 2;

export type RetryInfo = {
  status: number;
  attempt: number;
  delayMs: number;
};

export type FetchJsonMeta<T> = {
  data: T;
  headers: Headers;
  fetchedAt: number;
  status: number;
};

export type ConditionalHeaders = {
  etag?: string;
  lastModified?: string;
};

export type FetchJsonConditionalMeta<T> = {
  data: T | null;
  headers: Headers;
  fetchedAt: number;
  status: number;
  notModified: boolean;
};

export type HttpCachePolicy = {
  cacheable: boolean;
  ttlMs: number;
  staleMs: number;
};

export class HttpError extends Error {
  status: number;

  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  externalSignal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<T> {
  const result = await fetchJsonWithMeta<T>(url, init, timeoutMs, externalSignal, onRetry);
  return result.data;
}

export async function fetchJsonWithMeta<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  externalSignal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<FetchJsonMeta<T>> {
  if (externalSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const abortExternal = () => controller.abort();
    externalSignal?.addEventListener("abort", abortExternal);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });

      if (response.ok) {
        const data = (await response.json()) as T;
        return {
          data,
          headers: response.headers,
          fetchedAt: Date.now(),
          status: response.status
        };
      }

      if (isRetryable(response.status) && attempt < DEFAULT_RETRIES) {
        const delayMs = retryDelayMs(response, attempt);
        onRetry?.({ status: response.status, attempt: attempt + 1, delayMs });
        await sleep(delayMs, externalSignal);
        continue;
      }

      throw new HttpError(response.status);
    } catch (error) {
      if (isAbortError(error)) {
        if (externalSignal?.aborted) {
          throw error;
        }
        if (attempt < DEFAULT_RETRIES) {
          const delayMs = backoffDelay(attempt);
          onRetry?.({ status: 0, attempt: attempt + 1, delayMs });
          await sleep(delayMs, externalSignal);
          continue;
        }
      }

      if (isNetworkError(error) && attempt < DEFAULT_RETRIES) {
        const delayMs = backoffDelay(attempt);
        onRetry?.({ status: 0, attempt: attempt + 1, delayMs });
        await sleep(delayMs, externalSignal);
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortExternal);
    }
  }

  throw new HttpError(0, "HTTP retry exhausted");
}

export async function fetchJsonWithMetaConditional<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  externalSignal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void,
  conditional?: ConditionalHeaders
): Promise<FetchJsonConditionalMeta<T>> {
  if (externalSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const requestInit = withConditionalHeaders(init, conditional);

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const abortExternal = () => controller.abort();
    externalSignal?.addEventListener("abort", abortExternal);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...requestInit,
        signal: controller.signal
      });

      if (response.status === 304) {
        return {
          data: null,
          headers: response.headers,
          fetchedAt: Date.now(),
          status: response.status,
          notModified: true
        };
      }

      if (response.ok) {
        const data = (await response.json()) as T;
        return {
          data,
          headers: response.headers,
          fetchedAt: Date.now(),
          status: response.status,
          notModified: false
        };
      }

      if (isRetryable(response.status) && attempt < DEFAULT_RETRIES) {
        const delayMs = retryDelayMs(response, attempt);
        onRetry?.({ status: response.status, attempt: attempt + 1, delayMs });
        await sleep(delayMs, externalSignal);
        continue;
      }

      throw new HttpError(response.status);
    } catch (error) {
      if (isAbortError(error)) {
        if (externalSignal?.aborted) {
          throw error;
        }
        if (attempt < DEFAULT_RETRIES) {
          const delayMs = backoffDelay(attempt);
          onRetry?.({ status: 0, attempt: attempt + 1, delayMs });
          await sleep(delayMs, externalSignal);
          continue;
        }
      }

      if (isNetworkError(error) && attempt < DEFAULT_RETRIES) {
        const delayMs = backoffDelay(attempt);
        onRetry?.({ status: 0, attempt: attempt + 1, delayMs });
        await sleep(delayMs, externalSignal);
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortExternal);
    }
  }

  throw new HttpError(0, "HTTP retry exhausted");
}

export function resolveHttpCachePolicy(
  headers: Headers,
  params: {
    fallbackTtlMs: number;
    fallbackStaleMs?: number;
    fetchedAt?: number;
  }
): HttpCachePolicy {
  const fallbackTtlMs = Math.max(1, Math.floor(params.fallbackTtlMs));
  const fallbackStaleMs = Math.max(1, Math.floor(params.fallbackStaleMs ?? fallbackTtlMs));
  const fetchedAt = params.fetchedAt ?? Date.now();

  const cacheControl = headers.get("cache-control");
  if (cacheControl) {
    const directives = parseCacheControl(cacheControl);
    if (directives.has("no-store") || directives.has("no-cache")) {
      return {
        cacheable: false,
        ttlMs: fallbackTtlMs,
        staleMs: fallbackStaleMs
      };
    }
    const maxAge = directives.get("max-age");
    if (maxAge !== undefined) {
      const seconds = Number(maxAge);
      if (Number.isFinite(seconds) && seconds >= 0) {
        const ttlMs = Math.round(seconds * 1000);
        return {
          cacheable: true,
          ttlMs: Math.max(1, ttlMs),
          staleMs: Math.max(1, ttlMs)
        };
      }
    }
  }

  const expires = headers.get("expires");
  if (expires) {
    const at = Date.parse(expires);
    if (!Number.isNaN(at)) {
      const ttlMs = Math.max(1, at - fetchedAt);
      return {
        cacheable: true,
        ttlMs,
        staleMs: ttlMs
      };
    }
  }

  return {
    cacheable: true,
    ttlMs: fallbackTtlMs,
    staleMs: fallbackStaleMs
  };
}

function parseCacheControl(value: string): Map<string, string | undefined> {
  const directives = new Map<string, string | undefined>();
  for (const rawPart of value.split(",")) {
    const part = rawPart.trim().toLowerCase();
    if (!part) {
      continue;
    }
    const eqIndex = part.indexOf("=");
    if (eqIndex < 0) {
      directives.set(part, undefined);
      continue;
    }
    const key = part.slice(0, eqIndex).trim();
    let directiveValue = part.slice(eqIndex + 1).trim();
    directiveValue = directiveValue.replace(/^"|"$/g, "");
    directives.set(key, directiveValue);
  }
  return directives;
}

function withConditionalHeaders(init: RequestInit | undefined, conditional?: ConditionalHeaders): RequestInit | undefined {
  if (!conditional?.etag && !conditional?.lastModified) {
    return init;
  }

  const headers = new Headers(init?.headers);
  if (conditional.etag) {
    headers.set("If-None-Match", conditional.etag);
  }
  if (conditional.lastModified) {
    headers.set("If-Modified-Since", conditional.lastModified);
  }
  return {
    ...(init ?? {}),
    headers
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function backoffDelay(attempt: number): number {
  return 400 * Math.pow(2, attempt);
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }
  return backoffDelay(attempt);
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const when = Date.parse(value);
  if (Number.isNaN(when)) {
    return undefined;
  }

  return Math.max(0, when - Date.now());
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
