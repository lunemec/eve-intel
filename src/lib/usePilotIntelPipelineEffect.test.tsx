/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePilotIntelPipelineEffect } from "./usePilotIntelPipelineEffect";
import type { ParsedPilotInput, Settings } from "../types";
import type { PilotCard } from "./usePilotIntelPipeline";

const ENTRY: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

const SETTINGS: Settings = { lookbackDays: 7 };

describe("usePilotIntelPipelineEffect", () => {
  it("clears cards and logs when entries are empty", async () => {
    const setPilotCards = vi.fn();
    const setNetworkNotice = vi.fn();
    const logDebug = vi.fn();

    renderHook(() =>
      usePilotIntelPipelineEffect(
        {
          entries: [],
          settings: SETTINGS,
          dogmaIndex: null,
          logDebugRef: { current: logDebug },
          setPilotCards,
          setNetworkNotice
        },
        {
          createLoadingCard: vi.fn(),
          createPilotCardUpdater: vi.fn(),
          createPipelineLoggers: vi.fn(() => ({ logDebug, logError: vi.fn() })),
          createProcessPilot: vi.fn(),
          runPilotPipeline: vi.fn()
        }
      )
    );

    await waitFor(() => {
      expect(setPilotCards).toHaveBeenCalledWith([]);
    });
    expect(logDebug).toHaveBeenCalledWith("No parsed entries. Waiting for paste.");
    expect(setNetworkNotice).not.toHaveBeenCalled();
  });

  it("boots pipeline when entries exist and aborts on cleanup", async () => {
    const setPilotCards = vi.fn();
    const setNetworkNotice = vi.fn();
    const logDebug = vi.fn();
    const logError = vi.fn();
    const runPilotPipeline = vi.fn(async () => undefined);
    let capturedSignal: AbortSignal | undefined;
    const createProcessPilot = vi.fn((args: unknown) => {
      capturedSignal = (args as { signal: AbortSignal }).signal;
      return vi.fn(async () => undefined);
    });
    const createPilotCardUpdater = vi.fn(() => vi.fn());
    const createLoadingCard = vi.fn((entry: ParsedPilotInput): PilotCard => ({
      parsedEntry: entry,
      status: "loading",
      predictedShips: [],
      fitCandidates: [],
      kills: [],
      losses: [],
      inferenceKills: [],
      inferenceLosses: []
    }));

    const { unmount } = renderHook(() =>
      usePilotIntelPipelineEffect(
        {
          entries: [ENTRY],
          settings: SETTINGS,
          dogmaIndex: null,
          logDebugRef: { current: logDebug },
          setPilotCards,
          setNetworkNotice
        },
        {
          createLoadingCard,
          createPilotCardUpdater,
          createPipelineLoggers: vi.fn(() => ({ logDebug, logError })),
          createProcessPilot,
          runPilotPipeline
        }
      )
    );

    await waitFor(() => {
      expect(runPilotPipeline).toHaveBeenCalledTimes(1);
    });
    expect(setNetworkNotice).toHaveBeenCalledWith("");
    expect(setPilotCards).toHaveBeenCalledWith([expect.objectContaining({ parsedEntry: ENTRY })]);

    expect(createProcessPilot).toHaveBeenCalled();
    if (!capturedSignal) {
      throw new Error("Expected signal to be captured");
    }
    expect(capturedSignal.aborted).toBe(false);

    unmount();
    expect(capturedSignal.aborted).toBe(true);
  });
});
