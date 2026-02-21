/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildEnvelope, getLocalCachedState, setLocalCachedEnvelope, versionedKey } from "./localStore";

function createMemoryStorage(): Storage {
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
      data.set(key, String(value));
    }
  };
}

describe("cache/localStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T00:00:00Z"));
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("returns stale and expiry state transitions", () => {
    setLocalCachedEnvelope("alpha", buildEnvelope({ n: 1 }, 1000, 500), 250_000, 4_500_000);
    expect(getLocalCachedState<{ n: number }>("alpha")).toEqual({ value: { n: 1 }, stale: false });
    vi.advanceTimersByTime(600);
    expect(getLocalCachedState<{ n: number }>("alpha")).toEqual({ value: { n: 1 }, stale: true });
    vi.advanceTimersByTime(500);
    expect(getLocalCachedState<{ n: number }>("alpha")).toEqual({ value: null, stale: false });
  });

  it("returns null for corrupt json payload", () => {
    localStorage.setItem(versionedKey("corrupt"), "{bad");
    expect(getLocalCachedState("corrupt")).toEqual({ value: null, stale: false });
  });

  it("uses app-versioned cache key namespace", () => {
    const key = versionedKey("alpha");
    expect(key).toContain(".alpha");
    expect(key.startsWith("eve-intel.app-")).toBe(true);
  });
});
