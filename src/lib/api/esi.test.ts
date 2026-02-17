/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveUniverseNames } from "./esi";

describe("ESI universe names", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
