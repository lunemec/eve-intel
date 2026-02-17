import { describe, expect, it, vi } from "vitest";
import { resolveNamesSafely } from "./naming";
import { resolveUniverseNames } from "../api/esi";
import { withDogmaTypeNameFallback } from "../names";

vi.mock("../api/esi", () => ({
  resolveUniverseNames: vi.fn()
}));

vi.mock("../names", () => ({
  withDogmaTypeNameFallback: vi.fn()
}));

describe("pipeline naming", () => {
  it("returns empty map for empty id list", async () => {
    const result = await resolveNamesSafely({
      ids: [],
      signal: undefined,
      onRetry: () => () => undefined,
      dogmaIndex: null,
      logDebug: vi.fn()
    });

    expect(result.size).toBe(0);
    expect(resolveUniverseNames).not.toHaveBeenCalled();
  });

  it("resolves names and applies fallback merge on success", async () => {
    const mergedNames = new Map([[1, "One"]]);
    vi.mocked(resolveUniverseNames).mockResolvedValue(new Map([[1, "One"]]));
    vi.mocked(withDogmaTypeNameFallback).mockReturnValue({
      namesById: mergedNames,
      backfilledCount: 2
    });
    const logDebug = vi.fn();

    const result = await resolveNamesSafely({
      ids: [1],
      signal: undefined,
      onRetry: () => () => undefined,
      dogmaIndex: null,
      logDebug
    });

    expect(result).toBe(mergedNames);
    expect(logDebug).toHaveBeenCalledWith("Universe names resolved", {
      count: 1,
      dogmaBackfilled: 2
    });
  });

  it("falls back on resolve errors", async () => {
    vi.mocked(resolveUniverseNames).mockRejectedValue(new Error("nope"));
    const fallbackNames = new Map([[2, "Two"]]);
    vi.mocked(withDogmaTypeNameFallback).mockReturnValue({
      namesById: fallbackNames,
      backfilledCount: 1
    });
    const logDebug = vi.fn();

    const result = await resolveNamesSafely({
      ids: [2],
      signal: undefined,
      onRetry: () => () => undefined,
      dogmaIndex: null,
      logDebug
    });

    expect(result).toBe(fallbackNames);
    expect(logDebug).toHaveBeenCalledWith("Universe names resolution failed; continuing with fallbacks.", {
      dogmaBackfilled: 1
    });
  });
});
