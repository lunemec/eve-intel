const DEFAULT_TIMEOUT_MS = 9000;
const DEFAULT_RETRIES = 2;

export type RetryInfo = {
  status: number;
  attempt: number;
  delayMs: number;
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
        return (await response.json()) as T;
      }

      if (isRetryable(response.status) && attempt < DEFAULT_RETRIES) {
        const delayMs = backoffDelay(attempt);
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
