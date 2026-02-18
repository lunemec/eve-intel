import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PROBE_OPTIONS,
  deriveRetryHints,
  headersToObject,
  parseProbeArgs,
  runProbe
} from "./zkillRateLimitProbe";

describe("zkillRateLimitProbe", () => {
  it("parseProbeArgs applies defaults", () => {
    const parsed = parseProbeArgs(["https://zkillboard.com/api/kills/"]);

    expect(parsed).toEqual({
      ...DEFAULT_PROBE_OPTIONS,
      url: "https://zkillboard.com/api/kills/"
    });
  });

  it("parseProbeArgs parses all supported flags", () => {
    const parsed = parseProbeArgs([
      "https://zkillboard.com/api/kills/",
      "--attempts",
      "10",
      "--interval-ms",
      "50",
      "--timeout-ms",
      "5000",
      "--stop-on-status",
      "420,429,503",
      "--user-agent",
      "probe/1.0"
    ]);

    expect(parsed).toEqual({
      url: "https://zkillboard.com/api/kills/",
      attempts: 10,
      intervalMs: 50,
      timeoutMs: 5000,
      stopOnStatus: [420, 429, 503],
      userAgent: "probe/1.0",
      bodyPreviewBytes: 2048
    });
  });

  it("parseProbeArgs rejects invalid numeric flags", () => {
    expect(() => parseProbeArgs(["https://zkillboard.com/api/kills/", "--attempts", "0"]))
      .toThrowError(/attempts/i);
    expect(() => parseProbeArgs(["https://zkillboard.com/api/kills/", "--interval-ms", "-1"]))
      .toThrowError(/interval-ms/i);
    expect(() => parseProbeArgs(["https://zkillboard.com/api/kills/", "--timeout-ms", "0"]))
      .toThrowError(/timeout-ms/i);
  });

  it("headersToObject keeps header values without losing appended values", () => {
    const headers = new Headers();
    headers.append("x-bin-request-count", "1");
    headers.append("x-bin-request-count", "2");

    const output = headersToObject(headers);

    expect(output["x-bin-request-count"]).toBe("1, 2");
  });

  it("deriveRetryHints parses Retry-After numeric seconds", () => {
    const hints = deriveRetryHints(
      new Headers({
        "retry-after": "5"
      }),
      1_700_000_000_000
    );

    expect(hints).toEqual({
      retryAfterMs: 5000,
      retryAt: new Date(1_700_000_005_000).toISOString(),
      resetMs: undefined,
      resetAt: undefined,
      maxRequests: undefined,
      requestCount: undefined,
      remainingRequests: undefined,
      sources: ["retry-after"]
    });
  });

  it("deriveRetryHints parses Retry-After HTTP date", () => {
    const base = Date.UTC(2025, 0, 1, 12, 0, 0);
    const hints = deriveRetryHints(
      new Headers({
        "retry-after": new Date(base + 3000).toUTCString()
      }),
      base
    );

    expect(hints?.retryAfterMs).toBe(3000);
  });

  it("deriveRetryHints returns null when no supported headers exist", () => {
    const hints = deriveRetryHints(
      new Headers({
        "x-random": "value"
      }),
      1_700_000_000_000
    );

    expect(hints).toBeNull();
  });

  it("runProbe logs records and exits with 0 when all attempts complete", async () => {
    const logLines: string[] = [];
    const fetchFn = vi.fn().mockResolvedValue(
      new Response("payload", {
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json"
        }
      })
    );

    const code = await runProbe(
      {
        url: "https://zkillboard.com/api/kills/",
        attempts: 1,
        intervalMs: 0,
        timeoutMs: 1000,
        stopOnStatus: [420, 429],
        userAgent: "probe/1.0",
        bodyPreviewBytes: 2048
      },
      {
        fetchFn,
        nowFn: () => 1_700_000_000_000,
        sleepFn: async () => undefined,
        logFn: (line) => logLines.push(line),
        errorFn: (line) => logLines.push(line)
      }
    );

    expect(code).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const row = JSON.parse(logLines[0]) as Record<string, unknown>;
    expect(row.status).toBe(200);
    expect(row.bodyPreview).toBe("payload");
    expect(row.headers).toMatchObject({ "content-type": "application/json" });
  });

  it("runProbe stops on rate-limit status and exits with 2", async () => {
    const logLines: string[] = [];
    const fetchFn = vi.fn().mockResolvedValue(
      new Response("rate limited", {
        status: 420,
        statusText: "Enhance Your Calm",
        headers: {
          "x-bin-max-requests": "150",
          "x-bin-request-count": "150"
        }
      })
    );

    const code = await runProbe(
      {
        url: "https://zkillboard.com/api/kills/",
        attempts: 5,
        intervalMs: 0,
        timeoutMs: 1000,
        stopOnStatus: [420, 429],
        userAgent: "probe/1.0",
        bodyPreviewBytes: 2048
      },
      {
        fetchFn,
        nowFn: () => 1_700_000_000_000,
        sleepFn: async () => undefined,
        logFn: (line) => logLines.push(line),
        errorFn: (line) => logLines.push(line)
      }
    );

    expect(code).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const row = JSON.parse(logLines[0]) as Record<string, unknown>;
    expect(row.status).toBe(420);
    expect(row.retryHints).toMatchObject({
      maxRequests: 150,
      requestCount: 150,
      remainingRequests: 0
    });
  });
});
