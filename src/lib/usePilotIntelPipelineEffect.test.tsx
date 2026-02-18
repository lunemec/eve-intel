/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const ENTRY_B: ParsedPilotInput = {
  pilotName: "Pilot B",
  sourceLine: "Pilot B",
  parseConfidence: 1,
  shipSource: "inferred"
};

describe("usePilotIntelPipelineEffect", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears cards and logs when entries are empty", async () => {
    const logDebug = vi.fn();
    const logError = vi.fn();
    const setPilotCards = vi.fn();
    const setNetworkNotice = vi.fn();
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
    const runPilotPipeline = vi.fn(async () => undefined);

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
          createLoadingCard,
          createPipelineLoggers: vi.fn(() => ({ logDebug, logError })),
          createProcessPilot: vi.fn(() => vi.fn()),
          runPilotPipeline,
          fetchLatestKillsPage: vi.fn(async () => []),
          fetchLatestLossesPage: vi.fn(async () => [])
        }
      )
    );

    await waitFor(() => {
      expect(setPilotCards).toHaveBeenCalledWith([]);
    });
    expect(logDebug).toHaveBeenCalledWith("No parsed entries. Waiting for paste.");
    expect(runPilotPipeline).not.toHaveBeenCalled();
    expect(setNetworkNotice).not.toHaveBeenCalled();
  });

  it("runs incrementally and only starts newly added pilots; removed pilots are aborted", async () => {
    const logDebug = vi.fn();
    const logError = vi.fn();
    const setNetworkNotice = vi.fn();
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

    const signalByPilot = new Map<string, AbortSignal>();
    const releaseByPilot = new Map<string, () => void>();
    const runPilotPipeline = vi.fn(({ entries, signal }: { entries: ParsedPilotInput[]; signal?: AbortSignal }) => {
      const pilot = entries[0]?.pilotName ?? "unknown";
      if (signal) {
        signalByPilot.set(pilot, signal);
      }
      return new Promise<void>((resolve) => {
        releaseByPilot.set(pilot, resolve);
      });
    });

    const { result, rerender, unmount } = renderHook(
      ({ entries }) => {
        const [pilotCards, setPilotCards] = useState<PilotCard[]>([]);
        usePilotIntelPipelineEffect(
          {
            entries,
            settings: SETTINGS,
            dogmaIndex: null,
            logDebugRef: { current: logDebug },
            setPilotCards,
            setNetworkNotice
          },
          {
            createLoadingCard,
            createPipelineLoggers: vi.fn(() => ({ logDebug, logError })),
            createProcessPilot: vi.fn(() => vi.fn()),
            runPilotPipeline,
            fetchLatestKillsPage: vi.fn(async () => []),
            fetchLatestLossesPage: vi.fn(async () => [])
          }
        );
        return { pilotCards };
      },
      {
        initialProps: { entries: [ENTRY] as ParsedPilotInput[] }
      }
    );

    await waitFor(() => {
      expect(runPilotPipeline).toHaveBeenCalledTimes(1);
    });
    expect(setNetworkNotice).toHaveBeenCalledWith("");
    expect(result.current.pilotCards.map((row) => row.parsedEntry.pilotName)).toEqual(["Pilot A"]);
    expect(signalByPilot.get("Pilot A")?.aborted).toBe(false);

    rerender({ entries: [{ ...ENTRY }] });
    await waitFor(() => {
      expect(runPilotPipeline).toHaveBeenCalledTimes(1);
    });

    rerender({ entries: [{ ...ENTRY }, ENTRY_B] });
    await waitFor(() => {
      expect(runPilotPipeline).toHaveBeenCalledTimes(2);
    });
    expect(runPilotPipeline.mock.calls[1][0].entries[0].pilotName).toBe("Pilot B");
    expect(result.current.pilotCards.map((row) => row.parsedEntry.pilotName)).toEqual(["Pilot A", "Pilot B"]);

    rerender({ entries: [ENTRY_B] });
    await waitFor(() => {
      expect(result.current.pilotCards.map((row) => row.parsedEntry.pilotName)).toEqual(["Pilot B"]);
    });
    expect(signalByPilot.get("Pilot A")?.aborted).toBe(true);
    expect(signalByPilot.get("Pilot B")?.aborted).toBe(false);

    releaseByPilot.get("Pilot B")?.();
    await waitFor(() => {
      expect(runPilotPipeline).toHaveBeenCalledTimes(2);
    });

    unmount();
    expect(signalByPilot.get("Pilot B")?.aborted).toBe(false);
  });

  it("background revalidation reruns pilot pipeline only when latest page-1 kill/loss IDs change", async () => {
    vi.useFakeTimers();
    const logDebug = vi.fn();
    const logError = vi.fn();
    const setNetworkNotice = vi.fn();
    const setPilotCards = vi.fn();
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

    let refreshCalls = 0;
    const fetchLatestKillsPage = vi.fn(async () => {
      refreshCalls += 1;
      if (refreshCalls < 2) {
        return [{ killmail_id: 101, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }];
      }
      return [{ killmail_id: 202, killmail_time: "2026-02-18T00:01:00Z", victim: {}, attackers: [] }];
    });
    const fetchLatestLossesPage = vi.fn(async () => [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }]);

    const runPilotPipeline = vi.fn(async ({ entries, updatePilotCard }: {
      entries: ParsedPilotInput[];
      updatePilotCard: (pilotName: string, patch: Partial<PilotCard>) => void;
    }) => {
      updatePilotCard(entries[0].pilotName, {
        characterId: 9001,
        inferenceKills: [{ killmail_id: 101, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }],
        inferenceLosses: [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }]
      });
    });

    renderHook(() =>
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
          createPipelineLoggers: vi.fn(() => ({ logDebug, logError })),
          createProcessPilot: vi.fn(() => vi.fn()),
          runPilotPipeline,
          fetchLatestKillsPage,
          fetchLatestLossesPage
        }
      )
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(runPilotPipeline).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(46_000);
    await Promise.resolve();
    expect(runPilotPipeline).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(46_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(runPilotPipeline).toHaveBeenCalledTimes(2);
  }, 10_000);
});
