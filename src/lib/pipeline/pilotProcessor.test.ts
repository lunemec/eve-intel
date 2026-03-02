import { describe, expect, it, vi } from "vitest";
import { processPilotEntry } from "./pilotProcessor";
import type { ParsedPilotInput } from "../../types";

const ENTRY: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred",
  explicitShip: "Eris"
};

function makeErrorCard() {
  return {
    parsedEntry: ENTRY,
    status: "error" as const,
    fetchPhase: "error" as const,
    error: "Failed to fetch pilot intel: boom",
    characterId: 101,
    characterName: "Pilot A",
    corporationId: 1001,
    allianceId: 2002,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

describe("pipeline/pilotProcessor", () => {
  it("delegates single-pilot processing to breadth runtime pipeline", async () => {
    const logDebug = vi.fn();
    const onRetry = (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined;
    const runBreadthPilotPipeline = vi.fn(async () => undefined);

    await processPilotEntry(
      {
        entry: ENTRY,
        characterId: 101,
        settings: { lookbackDays: 7 },
        topShips: 5,
        deepHistoryMaxPages: 20,
        signal: undefined,
        onRetry,
        dogmaIndex: null,
        logDebug,
        isCancelled: () => false,
        updatePilotCard: vi.fn(),
        logError: vi.fn()
      },
      {
        runBreadthPilotPipeline,
        isAbortError: vi.fn(() => false),
        extractErrorMessage: vi.fn(() => "x"),
        createErrorCard: vi.fn()
      }
    );

    expect(runBreadthPilotPipeline).toHaveBeenCalledTimes(1);
    expect(runBreadthPilotPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: [{ entry: ENTRY, characterId: 101 }],
        lookbackDays: 7,
        topShips: 5,
        maxPages: 20
      })
    );
    expect(logDebug).not.toHaveBeenCalledWith("Pilot fetch failed", expect.anything());
  });

  it("ignores abort errors", async () => {
    const updatePilotCard = vi.fn();
    await processPilotEntry(
      {
        entry: ENTRY,
        characterId: 101,
        settings: { lookbackDays: 7 },
        topShips: 5,
        deepHistoryMaxPages: 20,
        signal: undefined,
        onRetry: (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined,
        dogmaIndex: null,
        logDebug: vi.fn(),
        isCancelled: () => false,
        updatePilotCard,
        logError: vi.fn()
      },
      {
        runBreadthPilotPipeline: vi.fn(async () => {
          throw new Error("abort");
        }),
        isAbortError: vi.fn(() => true),
        extractErrorMessage: vi.fn(() => "abort"),
        createErrorCard: vi.fn()
      }
    );

    expect(updatePilotCard).not.toHaveBeenCalled();
  });

  it("writes error card on non-abort errors", async () => {
    const updatePilotCard = vi.fn();
    const errorCard = makeErrorCard();
    const logError = vi.fn();

    await processPilotEntry(
      {
        entry: ENTRY,
        characterId: 101,
        settings: { lookbackDays: 7 },
        topShips: 5,
        deepHistoryMaxPages: 20,
        signal: undefined,
        onRetry: (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined,
        dogmaIndex: null,
        logDebug: vi.fn(),
        isCancelled: () => false,
        updatePilotCard,
        logError
      },
      {
        runBreadthPilotPipeline: vi.fn(async () => {
          throw new Error("boom");
        }),
        isAbortError: vi.fn(() => false),
        extractErrorMessage: vi.fn(() => "boom"),
        createErrorCard: vi.fn(() => errorCard)
      }
    );

    expect(logError).toHaveBeenCalledWith("Pilot intel fetch failed for Pilot A", expect.any(Error));
    expect(updatePilotCard).toHaveBeenCalledWith("Pilot A", errorCard);
  });
});
