import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, fetchJson, fetchJsonWithMeta, fetchJsonWithMetaConditional, resolveHttpCachePolicy } from "./http";

describe("fetchJson", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts immediately when external signal is already aborted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(fetchJson("https://example.test", undefined, 250, controller.signal)).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries HTTP 429 and succeeds on later attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const onRetry = vi.fn();

    const promise = fetchJson<{ ok: boolean }>("https://example.test", undefined, 250, undefined, onRetry);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith({ status: 429, attempt: 1, delayMs: 400 });
  });

  it("prefers Retry-After seconds over static backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "60" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const onRetry = vi.fn();

    const promise = fetchJson<{ ok: boolean }>("https://example.test", undefined, 250, undefined, onRetry);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ status: 429, attempt: 1 });
    expect(onRetry.mock.calls[0][0].delayMs).toBeGreaterThanOrEqual(59000);
    expect(onRetry.mock.calls[0][0].delayMs).toBeLessThanOrEqual(60000);
  });

  it("prefers Retry-After HTTP-date over static backoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T19:52:02.265Z"));
    const retryAt = new Date("2026-02-17T19:53:02.265Z").toUTCString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": retryAt }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const onRetry = vi.fn();

    const promise = fetchJson<{ ok: boolean }>("https://example.test", undefined, 250, undefined, onRetry);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ status: 429, attempt: 1 });
    expect(onRetry.mock.calls[0][0].delayMs).toBeGreaterThanOrEqual(59000);
    expect(onRetry.mock.calls[0][0].delayMs).toBeLessThanOrEqual(60000);
  });

  it("falls back to static backoff when Retry-After is invalid", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "not-a-number" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const onRetry = vi.fn();

    const promise = fetchJson<{ ok: boolean }>("https://example.test", undefined, 250, undefined, onRetry);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith({ status: 429, attempt: 1, delayMs: 400 });
  });

  it("retries network failures and succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const onRetry = vi.fn();

    const promise = fetchJson<{ ok: boolean }>("https://example.test", undefined, 250, undefined, onRetry);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith({ status: 0, attempt: 1, delayMs: 400 });
  });

  it("retries timeout aborts and succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const onRetry = vi.fn();

    const promise = fetchJson<{ ok: boolean }>("https://example.test", undefined, 10, undefined, onRetry);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith({ status: 0, attempt: 1, delayMs: 400 });
  });

  it("does not retry non-retryable HTTP status codes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchJson("https://example.test", undefined, 250)).rejects.toEqual(new HttpError(400));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns metadata via fetchJsonWithMeta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=3600"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJsonWithMeta<{ ok: boolean }>("https://example.test");
    expect(result.data).toEqual({ ok: true });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("max-age=3600");
    expect(typeof result.fetchedAt).toBe("number");
  });

  it("sends conditional headers and returns notModified on HTTP 304", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 304,
      headers: {
        etag: "\"etag-1\"",
        "last-modified": "Wed, 18 Feb 2026 00:00:00 GMT"
      }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJsonWithMetaConditional<unknown>(
      "https://example.test",
      undefined,
      250,
      undefined,
      undefined,
      { etag: "\"etag-1\"", lastModified: "Wed, 18 Feb 2026 00:00:00 GMT" }
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("if-none-match")).toBe("\"etag-1\"");
    expect(headers.get("if-modified-since")).toBe("Wed, 18 Feb 2026 00:00:00 GMT");
    expect(result.notModified).toBe(true);
    expect(result.status).toBe(304);
    expect(result.data).toBeNull();
  });
});

describe("resolveHttpCachePolicy", () => {
  it("uses cache-control max-age when present", () => {
    const headers = new Headers({ "cache-control": "public, max-age=3600" });
    const policy = resolveHttpCachePolicy(headers, { fallbackTtlMs: 1000, fetchedAt: Date.now() });
    expect(policy.cacheable).toBe(true);
    expect(policy.ttlMs).toBe(3_600_000);
    expect(policy.staleMs).toBe(3_600_000);
  });

  it("uses expires fallback when max-age is absent", () => {
    const fetchedAt = Date.parse("2026-02-17T20:00:00.000Z");
    const headers = new Headers({ expires: "Tue, 17 Feb 2026 20:05:00 GMT" });
    const policy = resolveHttpCachePolicy(headers, { fallbackTtlMs: 1000, fetchedAt });
    expect(policy.cacheable).toBe(true);
    expect(policy.ttlMs).toBe(300000);
    expect(policy.staleMs).toBe(300000);
  });

  it("treats no-store and no-cache conservatively", () => {
    const noStore = resolveHttpCachePolicy(new Headers({ "cache-control": "public, no-store" }), { fallbackTtlMs: 1234 });
    const noCache = resolveHttpCachePolicy(new Headers({ "cache-control": "max-age=60, no-cache" }), { fallbackTtlMs: 5678 });
    expect(noStore.cacheable).toBe(false);
    expect(noCache.cacheable).toBe(false);
  });

  it("falls back when headers are malformed", () => {
    const policy = resolveHttpCachePolicy(new Headers({ "cache-control": "max-age=abc", expires: "bad-date" }), {
      fallbackTtlMs: 2000,
      fallbackStaleMs: 1500
    });
    expect(policy).toEqual({ cacheable: true, ttlMs: 2000, staleMs: 1500 });
  });
});
