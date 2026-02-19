import { describe, expect, it, vi } from "vitest";
import { runPilotPipeline } from "./runPipeline";
import type { ParsedPilotInput } from "../../types";
import type { PilotCard } from "../usePilotIntelPipeline";

const ENTRY_A: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

const ENTRY_B: ParsedPilotInput = {
  pilotName: "Pilot B",
  sourceLine: "Pilot B",
  parseConfidence: 1,
  shipSource: "inferred"
};

function makeErrorCard(entry: ParsedPilotInput, error: string): PilotCard {
  return {
    parsedEntry: entry,
    status: "error",
    error,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

describe("pipeline/runPipeline", () => {
  it("resolves ids, marks unresolved pilots, runs resolved tasks, and logs completion", async () => {
    const setNetworkNotice = vi.fn();
    const updatePilotCard = vi.fn();
    const runBreadthPilotPipeline = vi.fn(async () => undefined);
    const onRetry = vi.fn((_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined);
    const logDebug = vi.fn();

    await runPilotPipeline(
      {
        entries: [ENTRY_A, ENTRY_B],
        lookbackDays: 7,
        topShips: 5,
        signal: undefined,
        isCancelled: () => false,
        logDebug,
        setNetworkNotice,
        updatePilotCard,
        logError: vi.fn()
      },
      {
        createRetryNoticeHandler: vi.fn(() => onRetry),
        resolveCharacterIds: vi.fn(async () => new Map([["pilot a", 101]])),
        collectUnresolvedEntries: vi.fn(() => [ENTRY_B]),
        buildUnresolvedPilotError: vi.fn(() => "Character not found in ESI."),
        buildResolvedPilotTasks: vi.fn(() => [{ entry: ENTRY_A, characterId: 101 }]),
        runBreadthPilotPipeline,
        createErrorCard: vi.fn((entry: ParsedPilotInput, error: string) => makeErrorCard(entry, error)),
        isAbortError: vi.fn(() => false),
        extractErrorMessage: vi.fn(() => "x")
      }
    );

    expect(setNetworkNotice).not.toHaveBeenCalled();
    expect(updatePilotCard).toHaveBeenCalledWith(
      "Pilot B",
      expect.objectContaining({ status: "error", error: "Character not found in ESI." })
    );
    expect(runBreadthPilotPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: [{ entry: ENTRY_A, characterId: 101 }],
        lookbackDays: 7,
        topShips: 5
      })
    );
    expect(logDebug).toHaveBeenCalledWith("Pipeline complete", { pilots: 2, unresolved: 1 });
  });

  it("records network notice and unresolved errors when ESI id resolution fails", async () => {
    const setNetworkNotice = vi.fn();
    const updatePilotCard = vi.fn();

    await runPilotPipeline(
      {
        entries: [ENTRY_A],
        lookbackDays: 7,
        topShips: 5,
        signal: undefined,
        isCancelled: () => false,
        logDebug: vi.fn(),
        setNetworkNotice,
        updatePilotCard,
        logError: vi.fn()
      },
      {
        createRetryNoticeHandler: vi.fn(() => vi.fn(() => vi.fn())),
        resolveCharacterIds: vi.fn(async () => {
          throw new Error("ids down");
        }),
        collectUnresolvedEntries: vi.fn(() => [ENTRY_A]),
        buildUnresolvedPilotError: vi.fn((msg: string | null) => `Character unresolved (ESI IDs error: ${msg})`),
        buildResolvedPilotTasks: vi.fn(() => []),
        runBreadthPilotPipeline: vi.fn(async () => undefined),
        createErrorCard: vi.fn((entry: ParsedPilotInput, error: string) => makeErrorCard(entry, error)),
        isAbortError: vi.fn(() => false),
        extractErrorMessage: vi.fn(() => "ids down")
      }
    );

    expect(setNetworkNotice).toHaveBeenCalledWith("ESI IDs lookup failed: ids down");
    expect(updatePilotCard).toHaveBeenCalledWith(
      "Pilot A",
      expect.objectContaining({ status: "error", error: "Character unresolved (ESI IDs error: ids down)" })
    );
  });

  it("returns early on abort during id resolution", async () => {
    const updatePilotCard = vi.fn();

    await runPilotPipeline(
      {
        entries: [ENTRY_A],
        lookbackDays: 7,
        topShips: 5,
        signal: undefined,
        isCancelled: () => false,
        logDebug: vi.fn(),
        setNetworkNotice: vi.fn(),
        updatePilotCard,
        logError: vi.fn()
      },
      {
        createRetryNoticeHandler: vi.fn(() => vi.fn(() => vi.fn())),
        resolveCharacterIds: vi.fn(async () => {
          throw new Error("aborted");
        }),
        collectUnresolvedEntries: vi.fn(() => [ENTRY_A]),
        buildUnresolvedPilotError: vi.fn(),
        buildResolvedPilotTasks: vi.fn(() => [{ entry: ENTRY_A, characterId: 101 }]),
        runBreadthPilotPipeline: vi.fn(async () => undefined),
        createErrorCard: vi.fn(),
        isAbortError: vi.fn(() => true),
        extractErrorMessage: vi.fn(() => "aborted")
      }
    );

    expect(updatePilotCard).not.toHaveBeenCalled();
  });
});
