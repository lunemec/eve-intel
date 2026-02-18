import { describe, expect, it, vi } from "vitest";
import {
  fetchCharacterStats,
  fetchLatestKills,
  fetchLatestKillsPage,
  fetchLatestKillsPaged,
  fetchLatestLossesPage,
  fetchRecentKills,
  ZKILL_MAX_LOOKBACK_DAYS
} from "./zkill";

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {})
    }
  });
}

describe("zkill API client", () => {
  it("returns empty array when API returns non-array payload", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return jsonResponse({ message: "temporarily unavailable" });
    });

    try {
      await expect(fetchRecentKills(12345, 14)).rejects.toThrow(/Unexpected zKill payload/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("hydrates zKill summary rows through ESI killmail endpoint", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("zkillboard.com/api")) {
        return jsonResponse([{ killmail_id: 777, zkb: { hash: "abc123", totalValue: 1000000 } }]);
      }

      if (url.includes("/killmails/777/abc123/")) {
        return jsonResponse({
          killmail_id: 777,
          killmail_time: "2025-10-30T00:00:00Z",
          victim: { character_id: 1, ship_type_id: 2 },
          attackers: [{ character_id: 3, ship_type_id: 4 }]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;

    try {
      const data = await fetchRecentKills(12345, 7);
      expect(data).toHaveLength(1);
      expect(data[0].killmail_id).toBe(777);
      expect(data[0].killmail_time).toBe("2025-10-30T00:00:00Z");
      expect(data[0].zkb?.hash).toBe("abc123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("hydrates partial killmail rows missing attacker/victim identity", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("zkillboard.com/api")) {
        return jsonResponse([
          {
            killmail_id: 778,
            killmail_time: "2025-10-31T00:00:00Z",
            victim: {},
            attackers: [],
            zkb: { hash: "def456", totalValue: 2000000 }
          }
        ]);
      }

      if (url.includes("/killmails/778/def456/")) {
        return jsonResponse({
          killmail_id: 778,
          killmail_time: "2025-10-31T00:00:00Z",
          victim: { character_id: 1, ship_type_id: 2 },
          attackers: [{ character_id: 3, ship_type_id: 4 }]
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;

    try {
      const data = await fetchRecentKills(12345, 7);
      expect(data).toHaveLength(1);
      expect(data[0].victim.ship_type_id).toBe(2);
      expect(data[0].attackers?.[0]?.character_id).toBe(3);
      expect(data[0].attackers?.[0]?.ship_type_id).toBe(4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("lookback clamping", () => {
  it("clamps pastSeconds requests to zKill max lookback", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      return jsonResponse([]);
    });
    globalThis.fetch = fetchMock;

    try {
      await fetchRecentKills(999, 30);
      expect(fetchMock).toHaveBeenCalled();
      const firstCall = fetchMock.mock.calls[0] as unknown as [unknown];
      const firstUrl = String(firstCall[0]);
      expect(firstUrl).toContain(`pastSeconds/${ZKILL_MAX_LOOKBACK_DAYS * 24 * 60 * 60}/`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("latest endpoint", () => {
  it("uses non-pastSeconds endpoint for latest history fallback", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      return jsonResponse([]);
    });
    globalThis.fetch = fetchMock;

    try {
      await fetchLatestKills(321);
      const firstCall = fetchMock.mock.calls[0] as unknown as [unknown];
      const firstUrl = String(firstCall[0]);
      expect(firstUrl).toContain("/kills/characterID/321/");
      expect(firstUrl.includes("pastSeconds")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("can walk paged latest kill history", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/page/1/")) {
        return jsonResponse(
          Array.from({ length: 200 }, (_, index) => ({
            killmail_id: 1000 + index,
            killmail_time: "2026-02-10T00:00:00Z",
            victim: {},
            attackers: []
          }))
        );
      }
      if (url.includes("/page/2/")) {
        return jsonResponse([
          {
            killmail_id: 2001,
            killmail_time: "2026-02-09T00:00:00Z",
            victim: {},
            attackers: []
          }
        ]);
      }
      if (url.includes("/page/3/")) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;

    try {
      const data = await fetchLatestKillsPaged(321, 4);
      expect(data).toHaveLength(201);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/kills/characterID/321/page/1/");
      expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/kills/characterID/321/page/2/");
      expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/kills/characterID/321/page/3/");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fetches explicit latest page endpoints for kills/losses", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      return jsonResponse([]);
    });
    globalThis.fetch = fetchMock;

    try {
      await fetchLatestKillsPage(321, 2);
      await fetchLatestLossesPage(654, 3);
      const calls = fetchMock.mock.calls as unknown[][];
      expect(String(calls[0]?.[0])).toContain("/kills/characterID/321/page/2/");
      expect(String(calls[1]?.[0])).toContain("/losses/characterID/654/page/3/");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("character stats endpoint", () => {
  it("parses all-time zKill stats payload", async () => {
    const characterId = 991408843;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/stats/characterID/${characterId}/`)) {
        return jsonResponse({
          shipsDestroyed: 4593,
          shipsLost: 12,
          soloKills: 272,
          avgGang: 3.6,
          gangRatio: 98,
          dangerRatio: 100,
          iskDestroyed: 465740000000,
          iskLost: 2850000000
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;

    try {
      const stats = await fetchCharacterStats(characterId);
      expect(stats?.kills).toBe(4593);
      expect(stats?.losses).toBe(12);
      expect(stats?.solo).toBe(272);
      expect(stats?.avgGangSize).toBe(3.6);
      expect(stats?.gangRatio).toBe(98);
      expect(stats?.danger).toBe(100);
      expect(stats?.iskDestroyed).toBe(465740000000);
      expect(stats?.iskLost).toBe(2850000000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps low dangerRatio percentages as percentages", async () => {
    const characterId = 2122717286;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/stats/characterID/${characterId}/`)) {
        return jsonResponse({
          shipsDestroyed: 19,
          shipsLost: 168,
          dangerRatio: 6,
          gangRatio: 90
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;

    try {
      const stats = await fetchCharacterStats(characterId);
      expect(stats?.danger).toBe(6);
      expect(stats?.gangRatio).toBe(90);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("propagates aborts and does not cache null from cancelled requests", async () => {
    const characterId = 991499999;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      return jsonResponse({
        shipsDestroyed: 7,
        shipsLost: 2
      });
    });
    globalThis.fetch = fetchMock;

    try {
      const controller = new AbortController();
      controller.abort();

      await expect(fetchCharacterStats(characterId, controller.signal)).rejects.toMatchObject({
        name: "AbortError"
      });

      const stats = await fetchCharacterStats(characterId);
      expect(stats?.kills).toBe(7);
      expect(stats?.losses).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("parses dangerous metric variants and normalizes 0-10 score to percent", async () => {
    const characterId = 991488888;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/stats/characterID/${characterId}/`)) {
        return jsonResponse({
          shipsDestroyed: 7,
          shipsLost: 3,
          dangerous: 7.5
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    globalThis.fetch = fetchMock;

    try {
      const stats = await fetchCharacterStats(characterId);
      expect(stats?.kills).toBe(7);
      expect(stats?.losses).toBe(3);
      expect(stats?.danger).toBe(75);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
