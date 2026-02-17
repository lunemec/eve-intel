/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCharacterIds, resolveInventoryTypeIdByName, resolveUniverseNames } from "./esi";

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

describe("ESI universe names", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  it("chunks large name lookups to avoid oversized ESI payloads", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const ids = JSON.parse((init?.body as string | undefined) ?? "[]") as number[];
      return new Response(JSON.stringify(ids.map((id) => ({ id, name: `Name ${id}` }))), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const ids = Array.from({ length: 1001 }, (_, i) => i + 1);
    const names = await resolveUniverseNames(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(names.get(1)).toBe("Name 1");
    expect(names.get(1001)).toBe("Name 1001");
  });

  it("keeps successful batches when a later batch fails", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const ids = JSON.parse((init?.body as string | undefined) ?? "[]") as number[];
      if (ids.includes(1001)) {
        return new Response("bad request", { status: 400 });
      }
      return new Response(JSON.stringify(ids.map((id) => ({ id, name: `Name ${id}` }))), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const ids = Array.from({ length: 1001 }, (_, i) => i + 1);
    const names = await resolveUniverseNames(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(names.get(1)).toBe("Name 1");
    expect(names.has(1001)).toBe(false);
  });

  it("propagates AbortError when names lookup is cancelled", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify([{ id: 1, name: "Name 1" }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(resolveUniverseNames([1], controller.signal)).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores unresolved names as short-lived misses and skips immediate refetch", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ characters: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await resolveCharacterIds(["Unknown Pilot"]);
    const second = await resolveCharacterIds(["Unknown Pilot"]);

    expect(first.size).toBe(0);
    expect(second.size).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent character-id lookups for identical payloads", async () => {
    const release: { resolve: (() => void) | null } = { resolve: null };
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release.resolve = () =>
            resolve(
              new Response(JSON.stringify({ characters: [{ id: 101, name: "Pilot A" }] }), {
                status: 200,
                headers: { "content-type": "application/json" }
              })
            );
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const pendingA = resolveCharacterIds(["Pilot A"]);
    const pendingB = resolveCharacterIds(["Pilot A"]);
    release.resolve?.();
    const [a, b] = await Promise.all([pendingA, pendingB]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.get("pilot a")).toBe(101);
    expect(b.get("pilot a")).toBe(101);
  });

  it("dedupes concurrent inventory type lookups for the same type name", async () => {
    const release: { resolve: (() => void) | null } = { resolve: null };
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release.resolve = () =>
            resolve(
              new Response(JSON.stringify({ inventory_types: [{ id: 22460, name: "Eris" }] }), {
                status: 200,
                headers: { "content-type": "application/json" }
              })
            );
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const pendingA = resolveInventoryTypeIdByName("Eris");
    const pendingB = resolveInventoryTypeIdByName("Eris");
    release.resolve?.();
    const [a, b] = await Promise.all([pendingA, pendingB]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(22460);
    expect(b).toBe(22460);
  });

  it("reuses cached universe names without repeat network calls", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const ids = JSON.parse((init?.body as string | undefined) ?? "[]") as number[];
      return new Response(JSON.stringify(ids.map((id) => ({ id, name: `Name ${id}` }))), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const ids = [7, 8, 9];
    const first = await resolveUniverseNames(ids);
    const second = await resolveUniverseNames(ids);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.get(8)).toBe("Name 8");
    expect(second.get(8)).toBe("Name 8");
  });
});
