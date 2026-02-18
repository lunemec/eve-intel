import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDogmaData } from "./loader";

describe("dogma loader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads manifest and pack and caches response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            activeVersion: "test-v1",
            packFile: "dogma-pack.test-v1.json",
            sha256: "abc",
            generatedAt: "2026-02-16T00:00:00Z"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            formatVersion: 1,
            source: "fuzzwork",
            sdeVersion: "test-v1",
            generatedAt: "2026-02-16T00:00:00Z",
            typeCount: 0,
            types: [],
            groups: [],
            categories: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const first = await loadDogmaData(true);
    const second = await loadDogmaData();
    expect(first.manifest.activeVersion).toBe("test-v1");
    expect(second.manifest.activeVersion).toBe("test-v1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on manifest load failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not found", { status: 404 })
    );
    await expect(loadDogmaData(true)).rejects.toThrow(/manifest fetch failed/i);
  });
});

