/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePilotIntelPipelineEffect } from "./usePilotIntelPipelineEffect";
import type { ParsedPilotInput, Settings } from "../types";
import type { PilotCard } from "./pilotDomain";
import type { ZkillCacheEvent } from "./api/zkill";

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

const ENTRY_EXPLICIT: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A (Eris)",
  explicitShip: "Eris",
  parseConfidence: 1,
  shipSource: "explicit"
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
    const fetchLatestKillsPage = vi.fn(async (_characterId: number, _page: number, _signal?: AbortSignal, _onRetry?: unknown, options?: {
      forceNetwork?: boolean;
      onCacheEvent?: (event: ZkillCacheEvent) => void;
    }) => {
      refreshCalls += 1;
      options?.onCacheEvent?.({
        forceNetwork: options.forceNetwork ?? false,
        status: 304,
        notModified: true,
        requestEtag: "\"etag-kills\"",
        responseEtag: "\"etag-kills\"",
        requestLastModified: "Wed, 18 Feb 2026 00:00:00 GMT",
        responseLastModified: "Wed, 18 Feb 2026 00:00:00 GMT"
      });
      if (refreshCalls < 2) {
        return [{ killmail_id: 101, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }];
      }
      return [{ killmail_id: 202, killmail_time: "2026-02-18T00:01:00Z", victim: {}, attackers: [] }];
    });
    const fetchLatestLossesPage = vi.fn(async (_characterId: number, _page: number, _signal?: AbortSignal, _onRetry?: unknown, options?: {
      forceNetwork?: boolean;
      onCacheEvent?: (event: ZkillCacheEvent) => void;
    }) => {
      options?.onCacheEvent?.({
        forceNetwork: options.forceNetwork ?? false,
        status: 200,
        notModified: false,
        requestEtag: "\"etag-losses\"",
        responseEtag: "\"etag-losses-new\"",
        requestLastModified: "Wed, 18 Feb 2026 00:00:00 GMT",
        responseLastModified: "Wed, 18 Feb 2026 00:01:00 GMT"
      });
      return [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }];
    });

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
          runPilotPipeline,
          fetchLatestKillsPage,
          fetchLatestLossesPage
        }
      )
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(runPilotPipeline).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_000);
    await Promise.resolve();
    expect(logDebug).toHaveBeenCalledWith("zKill page-1 refresh check", expect.objectContaining({
      pilot: "Pilot A",
      side: "kills",
      forceNetwork: false,
      requestEtag: "\"etag-kills\"",
      status: 304,
      notModified: true
    }));
    expect(runPilotPipeline).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(runPilotPipeline).toHaveBeenCalledTimes(2);
  }, 80_000);

  it("logs background refresh errors with pilot context", async () => {
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

    const fetchLatestKillsPage = vi.fn(async () => {
      throw new Error("kills endpoint timeout");
    });
    const fetchLatestLossesPage = vi.fn(async () => {
      throw new Error("losses endpoint timeout");
    });
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
          runPilotPipeline,
          fetchLatestKillsPage,
          fetchLatestLossesPage
        }
      )
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(runPilotPipeline).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(logDebug).toHaveBeenCalledWith(
      "zKill page-1 refresh failed",
      expect.objectContaining({
        pilot: "Pilot A",
        error: "kills endpoint timeout"
      })
    );
  });

  it("keeps visible card data stable during background rerun until ready patch arrives", async () => {
    vi.useFakeTimers();
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

    const fetchLatestKillsPage = vi.fn(async () => [
      { killmail_id: 202, killmail_time: "2026-02-18T00:01:00Z", victim: {}, attackers: [] }
    ]);
    const fetchLatestLossesPage = vi.fn(async () => [
      { killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }
    ]);

    let runCount = 0;
    const runPilotPipeline = vi.fn(async ({ entries, updatePilotCard }: {
      entries: ParsedPilotInput[];
      updatePilotCard: (pilotName: string, patch: Partial<PilotCard>) => void;
    }) => {
      runCount += 1;
      const pilotName = entries[0].pilotName;
      if (runCount === 1) {
        updatePilotCard(pilotName, {
          status: "ready",
          fetchPhase: "ready",
          characterId: 9001,
          predictedShips: [{ shipTypeId: 11957, shipName: "Falcon", probability: 100, source: "inferred", reason: [] }],
          fitCandidates: [],
          inferenceKills: [{ killmail_id: 101, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }],
          inferenceLosses: [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }]
        });
        return;
      }

      updatePilotCard(pilotName, {
        status: "ready",
        fetchPhase: "base",
        predictedShips: [],
        fitCandidates: [],
        inferenceKills: [{ killmail_id: 101, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }],
        inferenceLosses: [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }]
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 60_000);
      });
      updatePilotCard(pilotName, {
        status: "ready",
        fetchPhase: "ready",
        predictedShips: [{ shipTypeId: 22460, shipName: "Eris", probability: 100, source: "inferred", reason: [] }],
        fitCandidates: [],
        inferenceKills: [{ killmail_id: 202, killmail_time: "2026-02-18T00:01:00Z", victim: {}, attackers: [] }],
        inferenceLosses: [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }]
      });
    });

    const { result } = renderHook(() => {
      const [pilotCards, setPilotCards] = useState<PilotCard[]>([]);
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
          runPilotPipeline,
          fetchLatestKillsPage,
          fetchLatestLossesPage
        }
      );
      return { pilotCards };
    });

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(result.current.pilotCards[0]?.predictedShips[0]?.shipName).toBe("Falcon");

    await vi.advanceTimersByTimeAsync(31_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchLatestKillsPage).toHaveBeenCalled();
    expect(runPilotPipeline).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(result.current.pilotCards[0]?.fetchPhase).toBe("ready");
    expect(result.current.pilotCards[0]?.predictedShips[0]?.shipName).toBe("Falcon");

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current.pilotCards[0]?.predictedShips[0]?.shipName).toBe("Eris");
  }, 80_000);

  it("forces page-1 network refresh when explicit ship mismatches top inferred ship and reruns only on head change", async () => {
    vi.useFakeTimers();
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

    const fetchLatestKillsPage = vi.fn(async (_characterId: number, _page: number, _signal?: AbortSignal, _onRetry?: unknown, options?: {
      forceNetwork?: boolean;
      onCacheEvent?: (event: ZkillCacheEvent) => void;
    }) => {
      options?.onCacheEvent?.({
        forceNetwork: options.forceNetwork ?? false,
        status: 200,
        requestEtag: "\"kills-etag\"",
        responseEtag: "\"kills-etag-new\"",
        requestLastModified: "Wed, 18 Feb 2026 00:00:00 GMT",
        responseLastModified: "Wed, 18 Feb 2026 00:01:00 GMT",
        notModified: false
      });
      return [{ killmail_id: 202, killmail_time: "2026-02-18T00:01:00Z", victim: {}, attackers: [] }];
    });
    const fetchLatestLossesPage = vi.fn(async (_characterId: number, _page: number, _signal?: AbortSignal, _onRetry?: unknown, options?: {
      forceNetwork?: boolean;
      onCacheEvent?: (event: ZkillCacheEvent) => void;
    }) => {
      options?.onCacheEvent?.({
        forceNetwork: options.forceNetwork ?? false,
        status: 304,
        requestEtag: "\"losses-etag\"",
        responseEtag: "\"losses-etag\"",
        requestLastModified: "Wed, 18 Feb 2026 00:00:00 GMT",
        responseLastModified: "Wed, 18 Feb 2026 00:00:00 GMT",
        notModified: true
      });
      return [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }];
    });

    let pipelineRuns = 0;
    const runPilotPipeline = vi.fn(async ({ entries, updatePilotCard }: {
      entries: ParsedPilotInput[];
      updatePilotCard: (pilotName: string, patch: Partial<PilotCard>) => void;
    }) => {
      pipelineRuns += 1;
      const killmailId = pipelineRuns >= 2 ? 202 : 101;
      updatePilotCard(entries[0].pilotName, {
        characterId: 9001,
        predictedShips: [
          { shipTypeId: 11957, shipName: "Falcon", probability: 70, source: "inferred", reason: [] },
          { shipTypeId: 22460, shipName: "Eris", probability: 30, source: "inferred", reason: [] }
        ],
        inferenceKills: [{ killmail_id: killmailId, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }],
        inferenceLosses: [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }]
      });
    });

    const { rerender } = renderHook(
      ({ entries }) =>
        usePilotIntelPipelineEffect(
          {
            entries,
            settings: SETTINGS,
            dogmaIndex: null,
            logDebugRef: { current: logDebug },
            setPilotCards: vi.fn(),
            setNetworkNotice
          },
          {
            createLoadingCard,
            createPipelineLoggers: vi.fn(() => ({ logDebug, logError })),
            runPilotPipeline,
            fetchLatestKillsPage,
            fetchLatestLossesPage
          }
        ),
      { initialProps: { entries: [ENTRY] as ParsedPilotInput[] } }
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(runPilotPipeline).toHaveBeenCalledTimes(1);

    rerender({ entries: [ENTRY_EXPLICIT] });

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(runPilotPipeline).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(31_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchLatestKillsPage).toHaveBeenCalledWith(9001, 1, undefined, undefined, expect.objectContaining({ forceNetwork: true }));
    expect(fetchLatestLossesPage).toHaveBeenCalledWith(9001, 1, undefined, undefined, expect.objectContaining({ forceNetwork: true }));
    expect(logDebug).toHaveBeenCalledWith("zKill page-1 forced refresh response", expect.objectContaining({
      pilot: "Pilot A",
      side: "kills",
      forceNetwork: true,
      requestEtag: "\"kills-etag\"",
      responseEtag: "\"kills-etag-new\""
    }));
    expect(logDebug).toHaveBeenCalledWith("zKill page-1 forced refresh response", expect.objectContaining({
      pilot: "Pilot A",
      side: "losses",
      forceNetwork: true,
      requestEtag: "\"losses-etag\"",
      responseEtag: "\"losses-etag\"",
      status: 304,
      notModified: true
    }));
    expect(runPilotPipeline).toHaveBeenCalledTimes(2);
  });

  it("reruns pipeline immediately when explicit ship changes even if refresh head is unchanged", async () => {
    vi.useFakeTimers();
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

    const fetchLatestKillsPage = vi.fn(async (_characterId: number, _page: number, _signal?: AbortSignal, _onRetry?: unknown, options?: {
      forceNetwork?: boolean;
      onCacheEvent?: (event: ZkillCacheEvent) => void;
    }) => {
      options?.onCacheEvent?.({
        forceNetwork: options?.forceNetwork ?? false,
        status: 304,
        notModified: true
      });
      return [{ killmail_id: 101, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }];
    });
    const fetchLatestLossesPage = vi.fn(async (_characterId: number, _page: number, _signal?: AbortSignal, _onRetry?: unknown, options?: {
      forceNetwork?: boolean;
      onCacheEvent?: (event: ZkillCacheEvent) => void;
    }) => {
      options?.onCacheEvent?.({
        forceNetwork: options?.forceNetwork ?? false,
        status: 304,
        notModified: true
      });
      return [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }];
    });

    const runPilotPipeline = vi.fn(async ({ entries, updatePilotCard }: {
      entries: ParsedPilotInput[];
      updatePilotCard: (pilotName: string, patch: Partial<PilotCard>) => void;
    }) => {
      updatePilotCard(entries[0].pilotName, {
        characterId: 9001,
        predictedShips: [{ shipTypeId: 11957, shipName: "Falcon", probability: 100, source: "inferred", reason: [] }],
        inferenceKills: [{ killmail_id: 101, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }],
        inferenceLosses: [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }]
      });
    });

    const { rerender } = renderHook(
      ({ entries }) =>
        usePilotIntelPipelineEffect(
          {
            entries,
            settings: SETTINGS,
            dogmaIndex: null,
            logDebugRef: { current: logDebug },
            setPilotCards: vi.fn(),
            setNetworkNotice
          },
          {
            createLoadingCard,
            createPipelineLoggers: vi.fn(() => ({ logDebug, logError })),
            runPilotPipeline,
            fetchLatestKillsPage,
            fetchLatestLossesPage
          }
        ),
      { initialProps: { entries: [ENTRY] as ParsedPilotInput[] } }
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(runPilotPipeline).toHaveBeenCalledTimes(1);

    rerender({ entries: [ENTRY_EXPLICIT] });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(runPilotPipeline).toHaveBeenCalledTimes(2);
  });

  it("queues rerun when entry signature changes while pilot run is active", async () => {
    vi.useFakeTimers();
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

    const resolveRuns: Array<() => void> = [];
    const runPilotPipeline = vi.fn(async (_params: { entries: ParsedPilotInput[] }) => new Promise<void>((resolve) => {
      resolveRuns.push(resolve);
    }));

    const { rerender } = renderHook(
      ({ entries }) =>
        usePilotIntelPipelineEffect(
          {
            entries,
            settings: SETTINGS,
            dogmaIndex: null,
            logDebugRef: { current: logDebug },
            setPilotCards: vi.fn(),
            setNetworkNotice
          },
          {
            createLoadingCard,
            createPipelineLoggers: vi.fn(() => ({ logDebug, logError })),
            runPilotPipeline,
            fetchLatestKillsPage: vi.fn(async () => []),
            fetchLatestLossesPage: vi.fn(async () => [])
          }
        ),
      { initialProps: { entries: [ENTRY] as ParsedPilotInput[] } }
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(runPilotPipeline).toHaveBeenCalledTimes(1);

    rerender({ entries: [ENTRY_EXPLICIT] });
    await vi.advanceTimersByTimeAsync(0);
    expect(runPilotPipeline).toHaveBeenCalledTimes(1);

    resolveRuns[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(runPilotPipeline).toHaveBeenCalledTimes(2);
    expect(runPilotPipeline).toHaveBeenNthCalledWith(2, expect.objectContaining({ entries: [ENTRY_EXPLICIT] }));
  });

  it("clears removed non-active pilot refresh flags before re-add", async () => {
    vi.useFakeTimers();
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

    const fetchLatestKillsPage = vi.fn(async () => []);
    const fetchLatestLossesPage = vi.fn(async () => []);

    let pilotARuns = 0;
    const runPilotPipeline = vi.fn(async ({ entries, updatePilotCard }: {
      entries: ParsedPilotInput[];
      updatePilotCard: (pilotName: string, patch: Partial<PilotCard>) => void;
    }) => {
      const pilotName = entries[0]?.pilotName;
      if (pilotName !== "Pilot A") {
        return;
      }
      pilotARuns += 1;
      if (pilotARuns < 3) {
        updatePilotCard(pilotName, {
          predictedShips: [{ shipTypeId: 11957, shipName: "Falcon", probability: 100, source: "inferred", reason: [] }],
          inferenceKills: [{ killmail_id: 101, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }],
          inferenceLosses: [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }]
        });
        return;
      }
      updatePilotCard(pilotName, {
        characterId: 9001,
        predictedShips: [{ shipTypeId: 11957, shipName: "Falcon", probability: 100, source: "inferred", reason: [] }],
        inferenceKills: [{ killmail_id: 101, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }],
        inferenceLosses: [{ killmail_id: 301, killmail_time: "2026-02-18T00:00:00Z", victim: {}, attackers: [] }]
      });
    });

    const { rerender } = renderHook(
      ({ entries }) =>
        usePilotIntelPipelineEffect(
          {
            entries,
            settings: SETTINGS,
            dogmaIndex: null,
            logDebugRef: { current: logDebug },
            setPilotCards: vi.fn(),
            setNetworkNotice
          },
          {
            createLoadingCard,
            createPipelineLoggers: vi.fn(() => ({ logDebug, logError })),
            runPilotPipeline,
            fetchLatestKillsPage,
            fetchLatestLossesPage
          }
        ),
      { initialProps: { entries: [ENTRY, ENTRY_B] as ParsedPilotInput[] } }
    );

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    rerender({ entries: [ENTRY_EXPLICIT, ENTRY_B] });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    rerender({ entries: [ENTRY_B] });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    rerender({ entries: [ENTRY, ENTRY_B] });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(31_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchLatestKillsPage).toHaveBeenCalledWith(
      9001,
      1,
      undefined,
      undefined,
      expect.objectContaining({ forceNetwork: false })
    );
    expect(fetchLatestLossesPage).toHaveBeenCalledWith(
      9001,
      1,
      undefined,
      undefined,
      expect.objectContaining({ forceNetwork: false })
    );
  });
});
