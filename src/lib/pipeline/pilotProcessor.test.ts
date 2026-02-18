import { describe, expect, it, vi } from "vitest";
import { processPilotEntry } from "./pilotProcessor";
import type { ParsedPilotInput } from "../../types";
import type { PilotCard } from "../usePilotIntelPipeline";

const ENTRY: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred",
  explicitShip: "Eris"
};

function makeStageOneRow(): PilotCard {
  return {
    parsedEntry: ENTRY,
    status: "ready",
    fetchPhase: "enriching",
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
  it("runs stage one and stage two and updates pilot card", async () => {
    const updatePilotCard = vi.fn();
    const logDebug = vi.fn();
    const onRetry = (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined;
    const stageOneRow = makeStageOneRow();

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
        updatePilotCard,
        logError: vi.fn()
      },
      {
        fetchAndPrepareStageOne: vi.fn(async () => ({
          character: {
            character_id: 101,
            name: "Pilot A",
            corporation_id: 1001,
            alliance_id: 2002,
            security_status: 2.1
          },
          stageOneRow,
          stageOneDerived: {
            predictedShips: [{ shipName: "Eris", probability: 100, source: "explicit" as const, reason: [] }],
            fitCandidates: [],
            cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] }
          }
        })),
        fetchAndMergeStageTwoHistory: vi.fn(async () => ({
          mergedInferenceKills: [],
          mergedInferenceLosses: []
        })),
        enrichStageTwoRow: vi.fn(async () => ({
          stageTwoRow: { ...stageOneRow, fetchPhase: "ready" as const },
          namesById: new Map<number, string>()
        })),
        loadDerivedInferenceWithCache: vi.fn(async () => ({
          predictedShips: [{ shipName: "Eris", probability: 100, source: "explicit" as const, reason: [] }],
          fitCandidates: [{ shipTypeId: 22460, fitLabel: "Eris", confidence: 99, alternates: [] }],
          cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] }
        })),
        ensureExplicitShipTypeId: vi.fn(async () => undefined),
        isAbortError: vi.fn(() => false),
        extractErrorMessage: vi.fn(() => "x"),
        createErrorCard: vi.fn()
      }
    );

    expect(updatePilotCard).toHaveBeenCalledTimes(2);
    expect(updatePilotCard).toHaveBeenLastCalledWith(
      "Pilot A",
      expect.objectContaining({ fetchPhase: "ready" })
    );
    expect(logDebug).toHaveBeenCalledWith("Pilot stage 2 ready", {
      pilot: "Pilot A",
      predicted: 1,
      fits: 1
    });
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
        fetchAndPrepareStageOne: vi.fn(async () => {
          throw new Error("abort");
        }),
        fetchAndMergeStageTwoHistory: vi.fn(),
        enrichStageTwoRow: vi.fn(),
        loadDerivedInferenceWithCache: vi.fn(),
        ensureExplicitShipTypeId: vi.fn(),
        isAbortError: vi.fn(() => true),
        extractErrorMessage: vi.fn(() => "abort"),
        createErrorCard: vi.fn()
      }
    );

    expect(updatePilotCard).not.toHaveBeenCalled();
  });

  it("writes error card on non-abort errors", async () => {
    const updatePilotCard = vi.fn();
    const errorCard = {
      ...makeStageOneRow(),
      status: "error" as const,
      error: "Failed to fetch pilot intel: boom"
    };

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
        fetchAndPrepareStageOne: vi.fn(async () => {
          throw new Error("boom");
        }),
        fetchAndMergeStageTwoHistory: vi.fn(),
        enrichStageTwoRow: vi.fn(),
        loadDerivedInferenceWithCache: vi.fn(),
        ensureExplicitShipTypeId: vi.fn(),
        isAbortError: vi.fn(() => false),
        extractErrorMessage: vi.fn(() => "boom"),
        createErrorCard: vi.fn(() => errorCard)
      }
    );

    expect(updatePilotCard).toHaveBeenCalledWith("Pilot A", errorCard);
  });
});
