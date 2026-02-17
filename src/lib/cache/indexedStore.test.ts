/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearIndexedStore, getIndexedEnvelope, removeIndexedEnvelope, setIndexedEnvelope } from "./indexedStore";

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
            put: (value: unknown & { key: string }) => {
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

describe("cache/indexedStore", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", createFakeIndexedDb());
  });

  it("stores, gets, removes and clears envelopes", async () => {
    await setIndexedEnvelope("eve-intel.v3.alpha", {
      writtenAt: Date.now(),
      staleAt: Date.now() + 1000,
      expiresAt: Date.now() + 2000,
      value: { ok: true }
    });
    const first = await getIndexedEnvelope<{ ok: boolean }>("eve-intel.v3.alpha");
    expect(first?.value).toEqual({ ok: true });

    await removeIndexedEnvelope("eve-intel.v3.alpha");
    const removed = await getIndexedEnvelope("eve-intel.v3.alpha");
    expect(removed).toBeNull();

    await setIndexedEnvelope("eve-intel.v3.beta", {
      writtenAt: Date.now(),
      staleAt: Date.now() + 1000,
      expiresAt: Date.now() + 2000,
      value: { ok: true }
    });
    await clearIndexedStore();
    const cleared = await getIndexedEnvelope("eve-intel.v3.beta");
    expect(cleared).toBeNull();
  });
});
