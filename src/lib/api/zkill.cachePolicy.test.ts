import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../cache", () => ({
  getCachedStateAsync: vi.fn(async () => ({ value: null, stale: false })),
  setCachedAsync: vi.fn(async () => undefined)
}));

import { setCachedAsync } from "../cache";
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
