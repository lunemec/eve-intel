/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSuggestedPilotCards } from "./useSuggestedPilotCards";
import type { PilotCard } from "./pilotDomain";
import * as runPipeline from "./pipeline/runPipeline";

describe("useSuggestedPilotCards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses canonical resolved pipeline entrypoint for suggested pilots", async () => {
    const runResolvedPilotPipelineSpy = vi
      .spyOn(runPipeline, "runResolvedPilotPipeline")
      .mockResolvedValue(undefined);

    const logDebug = vi.fn();
    const suggestedPilotIds = [9002, 9001];
    const { result } = renderHook(() =>
      useSuggestedPilotCards({
        suggestedPilotIds,
        lookbackDays: 7,
        dogmaIndex: null,
        logDebug
      })
    );

    await waitFor(() => {
      expect(result.current).toHaveLength(2);
      expect(result.current.every((card: PilotCard) => card.status === "loading")).toBe(true);
      expect(runResolvedPilotPipelineSpy).toHaveBeenCalledTimes(1);
    });

    expect(runResolvedPilotPipelineSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: [
          expect.objectContaining({ characterId: 9001, priority: "suggested" }),
          expect.objectContaining({ characterId: 9002, priority: "suggested" })
        ],
        lookbackDays: 7,
        topShips: 5
      })
    );
  });
});

