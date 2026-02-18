/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeStorageOptions = {
  throwOnSet?: boolean;
};

function createMemoryStorage(options: FakeStorageOptions = {}): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      if (options.throwOnSet) {
        throw new Error("quota exceeded");
      }
      data.set(key, String(value));
    }
  };
}

function createFakeIndexedDb() {
  const rows = new Map<string, unknown>();
  return {
    open(_name: string, _version: number) {
      const request: {
        result?: unknown;
        error?: Error;
        onupgradeneeded?: () => void;
        onsuccess?: () => void;
        onerror?: () => void;
      } = {};
      const db = {
        objectStoreNames: {
          contains: () => true
        },
        createObjectStore: () => undefined,
        transaction: () => ({
          objectStore: () => ({
            get: (key: string) => {
              const req: { result?: unknown; error?: Error; onsuccess?: () => void; onerror?: () => void } = {};
              setTimeout(() => {
                req.result = rows.get(key);
                req.onsuccess?.();
              }, 0);
              return req;
            },
            put: (value: { key: string; envelope: unknown }) => {
              const req: { error?: Error; onsuccess?: () => void; onerror?: () => void } = {};
              setTimeout(() => {
                rows.set(value.key, value);
                req.onsuccess?.();
              }, 0);
              return req;
            },
            delete: (key: string) => {
              const req: { error?: Error; onsuccess?: () => void; onerror?: () => void } = {};
              setTimeout(() => {
                rows.delete(key);
                req.onsuccess?.();
              }, 0);
              return req;
            },
            clear: () => {
              const req: { error?: Error; onsuccess?: () => void; onerror?: () => void } = {};
              setTimeout(() => {
                rows.clear();
                req.onsuccess?.();
              }, 0);
              return req;
            }
          })
        })
      };
      setTimeout(() => {
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    }
  };
}

describe("cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T00:00:00Z"));
    vi.resetModules();
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("indexedDB", createFakeIndexedDb());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("tracks stale and expiry boundaries", async () => {
    const cache = await import("./cache");
    cache.setCached("alpha", { n: 1 }, 1000, 500);

    expect(cache.getCachedState<{ n: number }>("alpha")).toEqual({
      value: { n: 1 },
      stale: false
    });

    vi.advanceTimersByTime(600);
    expect(cache.getCachedState<{ n: number }>("alpha")).toEqual({
      value: { n: 1 },
      stale: true
    });

    vi.advanceTimersByTime(500);
    expect(cache.getCachedState<{ n: number }>("alpha")).toEqual({
      value: null,
      stale: false
    });
  });

  it("returns null safely for corrupt cache payloads", async () => {
    const cache = await import("./cache");
    localStorage.setItem("eve-intel.v3.corrupt", "{this is not valid json");

    expect(cache.getCachedState<unknown>("corrupt")).toEqual({
      value: null,
      stale: false
    });
  });

  it("evicts oldest versioned entries when local budget would be exceeded", async () => {
    const cache = await import("./cache");
    const now = Date.now();
    const big = "x".repeat(220_000);

    for (let i = 0; i < 20; i += 1) {
      localStorage.setItem(
        `eve-intel.v3.old.${i}`,
        JSON.stringify({
          writtenAt: now + i,
          staleAt: now + 10_000,
          expiresAt: now + 20_000,
          value: big
        })
      );
    }

    cache.setCached("incoming", { payload: "y".repeat(220_000) }, 10_000, 5_000);
    expect(localStorage.getItem("eve-intel.v3.incoming")).toBeTruthy();

    const old0 = localStorage.getItem("eve-intel.v3.old.0");
    const old1 = localStorage.getItem("eve-intel.v3.old.1");
    expect(old0 === null || old1 === null).toBe(true);
  });

  it("falls back to indexedDB when localStorage writes fail", async () => {
    vi.useRealTimers();
    vi.stubGlobal("localStorage", createMemoryStorage({ throwOnSet: true }));
    const cache = await import("./cache");

    await cache.setCachedAsync("idb-only", { ok: true }, 60_000, 30_000);

    expect(cache.getCachedState<{ ok: boolean }>("idb-only").value).toBeNull();
    const restored = await cache.getCachedStateAsync<{ ok: boolean }>("idb-only");
    expect(restored.value).toEqual({ ok: true });
  });
});
