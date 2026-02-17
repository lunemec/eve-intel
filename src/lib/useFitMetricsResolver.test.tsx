/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PilotCard } from "./usePilotIntelPipeline";
import { useFitMetricsResolver } from "./useFitMetricsResolver";
import { createFitMetricsResolver } from "./useFitMetrics";

vi.mock("./useFitMetrics", () => ({
  createFitMetricsResolver: vi.fn()
}));

function makePilot(): PilotCard {
  return {
    parsedEntry: {
      pilotName: "Pilot A",
      sourceLine: "Pilot A",
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "ready",
    fetchPhase: "ready",
    characterId: 123,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

describe("useFitMetricsResolver", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lazily creates resolver once and reuses it while deps are stable", () => {
    const resolver = vi.fn(() => ({ status: "unavailable" as const, key: "none", reason: "No fit" }));
    vi.mocked(createFitMetricsResolver).mockReturnValue(resolver);
    const logDebug = vi.fn();

    const { result } = renderHook(() =>
      useFitMetricsResolver({
        dogmaIndex: {} as never,
        logDebug
      })
    );

    act(() => {
      result.current(makePilot(), undefined);
      result.current(makePilot(), undefined);
    });

    expect(createFitMetricsResolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("resets resolver when dependencies change", () => {
    const resolverA = vi.fn(() => ({ status: "unavailable" as const, key: "a", reason: "A" }));
    const resolverB = vi.fn(() => ({ status: "unavailable" as const, key: "b", reason: "B" }));
    vi.mocked(createFitMetricsResolver).mockReturnValueOnce(resolverA).mockReturnValueOnce(resolverB);
    const logDebugA = vi.fn();
    const logDebugB = vi.fn();

    const { result, rerender } = renderHook(
      ({ dogmaIndex, logDebug }: { dogmaIndex: object; logDebug: (message: string, data?: unknown) => void }) =>
        useFitMetricsResolver({
          dogmaIndex: dogmaIndex as never,
          logDebug
        }),
      {
        initialProps: { dogmaIndex: { v: 1 }, logDebug: logDebugA }
      }
    );

    act(() => {
      result.current(makePilot(), undefined);
    });
    rerender({ dogmaIndex: { v: 2 }, logDebug: logDebugB });
    act(() => {
      result.current(makePilot(), undefined);
    });

    expect(createFitMetricsResolver).toHaveBeenCalledTimes(2);
    expect(resolverA).toHaveBeenCalledTimes(1);
    expect(resolverB).toHaveBeenCalledTimes(1);
  });
});
