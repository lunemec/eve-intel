import { describe, expect, it } from "vitest";
import { executeWithRetry } from "../lib/zkill-fit-fetch-cli/retry.mjs";

function createHttpError(message, { status, headers } = {}) {
  const error = new Error(message);
  if (status !== undefined) {
    error.status = status;
  }
  if (headers !== undefined) {
    error.headers = headers;
  }
  return error;
}

describe("executeWithRetry", () => {
  it("prioritizes Retry-After header delays over fallback backoff", async () => {
    const observedDelays = [];
    const request = async ({ attempt }) => {
      if (attempt === 1) {
        throw createHttpError("rate limited", {
          status: 429,
          headers: {
            "retry-after": "3",
            "ratelimit-reset-after": "30"
          }
        });
      }

      return { ok: true, attempt };
    };

    const result = await executeWithRetry({
      request,
      retryPolicy: { maxAttempts: 3, baseMs: 100, maxMs: 1_000 },
      requestTimeoutMs: 5_000,
      now: () => 0,
      sleep: async (delayMs) => {
        observedDelays.push(delayMs);
      }
    });

    expect(result).toEqual({ ok: true, attempt: 2 });
    expect(observedDelays).toEqual([3_000]);
  });

  it("uses exponential fallback backoff when retry headers are absent", async () => {
    const observedDelays = [];
    let attempts = 0;

    const result = await executeWithRetry({
      request: async () => {
        attempts += 1;
        if (attempts <= 2) {
          throw createHttpError(`transient-${attempts}`, { status: 503 });
        }
        return { ok: true };
      },
      retryPolicy: { maxAttempts: 5, baseMs: 100, maxMs: 250 },
      requestTimeoutMs: 5_000,
      sleep: async (delayMs) => {
        observedDelays.push(delayMs);
      }
    });

    expect(result).toEqual({ ok: true });
    expect(observedDelays).toEqual([100, 200]);
  });

  it("stops retrying at maxAttempts and throws the terminal error", async () => {
    const observedDelays = [];
    let attempts = 0;

    await expect(
      executeWithRetry({
        request: async () => {
          attempts += 1;
          throw createHttpError(`terminal-${attempts}`, { status: 503 });
        },
        retryPolicy: { maxAttempts: 3, baseMs: 50, maxMs: 1_000 },
        requestTimeoutMs: 5_000,
        sleep: async (delayMs) => {
          observedDelays.push(delayMs);
        }
      })
    ).rejects.toThrow("terminal-3");

    expect(attempts).toBe(3);
    expect(observedDelays).toEqual([50, 100]);
  });

  it("applies request timeout aborts and still respects retry caps", async () => {
    const observedDelays = [];
    const observedTimeouts = [];
    const observedClearTimeouts = [];
    let attempts = 0;

    await expect(
      executeWithRetry({
        request: async ({ signal }) => {
          attempts += 1;
          if (!signal.aborted) {
            throw new Error("expected aborted signal");
          }
          const timeoutError = new Error(`timeout-${attempts}`);
          timeoutError.name = "AbortError";
          throw timeoutError;
        },
        retryPolicy: { maxAttempts: 2, baseMs: 25, maxMs: 1_000 },
        requestTimeoutMs: 250,
        sleep: async (delayMs) => {
          observedDelays.push(delayMs);
        },
        setTimeoutFn: (callback, ms) => {
          observedTimeouts.push(ms);
          callback();
          return observedTimeouts.length;
        },
        clearTimeoutFn: (id) => {
          observedClearTimeouts.push(id);
        }
      })
    ).rejects.toThrow("timeout-2");

    expect(attempts).toBe(2);
    expect(observedTimeouts).toEqual([250, 250]);
    expect(observedClearTimeouts).toEqual([1, 2]);
    expect(observedDelays).toEqual([25]);
  });
});
