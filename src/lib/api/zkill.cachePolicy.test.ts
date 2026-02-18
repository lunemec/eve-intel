import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../cache", () => ({
  getCachedStateAsync: vi.fn(async () => ({ value: null, stale: false })),
  setCachedAsync: vi.fn(async () => undefined)
}));

import { getCachedStateAsync, setCachedAsync } from "../cache";
import { fetchLatestKillsPage } from "./zkill";

describe("zkill cache policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses HTTP max-age for zKill list cache TTL", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            killmail_id: 1,
            killmail_time: "2026-02-17T00:00:00Z",
            victim: { ship_type_id: 123 },
            attackers: [{ character_id: 1, ship_type_id: 123 }]
          }
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" }
        }
      )
    ) as typeof fetch;

    try {
      await fetchLatestKillsPage(12345, 1);
      expect(vi.mocked(setCachedAsync)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(setCachedAsync).mock.calls[0][2]).toBe(3_600_000);
      expect(vi.mocked(setCachedAsync).mock.calls[0][3]).toBe(3_600_000);
      expect(vi.mocked(setCachedAsync).mock.calls[0][1]).toEqual(
        expect.objectContaining({
          rows: expect.any(Array),
          etag: undefined,
          lastModified: undefined,
          validatedAt: expect.any(Number)
        })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("revalidates with ETag/Last-Modified and keeps rows on HTTP 304", async () => {
    vi.mocked(getCachedStateAsync).mockResolvedValueOnce({
      value: {
        rows: [
          {
            killmail_id: 5,
            killmail_time: "2026-02-18T00:00:00Z",
            victim: { ship_type_id: 123 },
            attackers: [{ character_id: 1, ship_type_id: 123 }]
          }
        ],
        etag: "\"etag-5\"",
        lastModified: "Wed, 18 Feb 2026 00:00:00 GMT",
        validatedAt: Date.now() - 60_000
      },
      stale: false
    });

    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, {
        status: 304,
        headers: {
          etag: "\"etag-5\"",
          "last-modified": "Wed, 18 Feb 2026 00:00:00 GMT",
          "cache-control": "public, max-age=60"
        }
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const rows = await fetchLatestKillsPage(12345, 1);
      expect(rows).toHaveLength(1);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      const headers = new Headers(init?.headers);
      expect(headers.get("if-none-match")).toBe("\"etag-5\"");
      expect(headers.get("if-modified-since")).toBe("Wed, 18 Feb 2026 00:00:00 GMT");
      expect(vi.mocked(setCachedAsync)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(setCachedAsync).mock.calls[0][2]).toBe(60_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not cache zKill list responses marked no-store", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            killmail_id: 2,
            killmail_time: "2026-02-17T00:00:00Z",
            victim: { ship_type_id: 123 },
            attackers: [{ character_id: 1, ship_type_id: 123 }]
          }
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "public, no-store" }
        }
      )
    ) as typeof fetch;

    try {
      await fetchLatestKillsPage(12345, 1);
      expect(vi.mocked(setCachedAsync)).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
