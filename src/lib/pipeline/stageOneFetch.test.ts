import { describe, expect, it, vi } from "vitest";
import { fetchAndPrepareStageOne } from "./stageOneFetch";
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

describe("pipeline/stageOneFetch", () => {
  it("orchestrates stage-one fetch, enrichment, inference, and explicit ship resolution", async () => {
    const character = {
      character_id: 101,
      name: "Pilot A",
      corporation_id: 1001,
      alliance_id: 2002,
      security_status: 2.1
    };
    const fetchPilotInferenceWindow = vi.fn(async () => ({
      character,
      kills: [],
      losses: [],
      zkillStats: null,
      inferenceKills: [],
      inferenceLosses: []
    }));

    const stageOneRow = makeStageOneRow();
    const stageOneNames = new Map<number, string>([
      [1001, "Corp A"],
      [2002, "Alliance A"]
    ]);
    const enrichStageOneRow = vi.fn(async () => ({ stageOneRow, namesById: stageOneNames }));

    const derived = {
      predictedShips: [{ shipName: "Eris", probability: 100, source: "explicit" as const, reason: [] }],
      fitCandidates: [],
      cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] }
    };
    const loadDerivedInferenceWithCache = vi.fn(async () => derived);
    const ensureExplicitShipTypeId = vi.fn(async () => undefined);

    const result = await fetchAndPrepareStageOne(
      {
        entry: ENTRY,
        characterId: 101,
        settings: { lookbackDays: 7 },
        topShips: 5,
        signal: undefined,
        onRetry: (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined,
        dogmaIndex: null,
        logDebug: vi.fn()
      },
      {
        fetchPilotInferenceWindow,
        derivePilotStats: vi.fn(() => ({
          kills: 0,
          losses: 0,
          kdRatio: 0,
          solo: 0,
          soloRatio: 0,
          iskDestroyed: 0,
          iskLost: 0,
          iskRatio: 0,
          danger: 0
        })),
        mergePilotStats: vi.fn(({ derived: stats }) => stats),
        enrichStageOneRow,
        loadDerivedInferenceWithCache,
        ensureExplicitShipTypeId
      }
    );

    expect(fetchPilotInferenceWindow).toHaveBeenCalledTimes(1);
    expect(enrichStageOneRow).toHaveBeenCalledTimes(1);
    expect(loadDerivedInferenceWithCache).toHaveBeenCalledWith(
      expect.objectContaining({ row: stageOneRow, topShips: 5 })
    );
    expect(ensureExplicitShipTypeId).toHaveBeenCalledWith(
      expect.objectContaining({ parsedEntry: ENTRY, predictedShips: derived.predictedShips })
    );

    expect(result).not.toBeNull();
    const nonNullResult = result!;
    expect(nonNullResult.character).toBe(character);
    expect(nonNullResult.stageOneRow).toBe(stageOneRow);
    expect(nonNullResult.stageOneDerived).toBe(derived);
  });

  it("returns null and skips downstream work when cancelled after initial fetch", async () => {
    const fetchPilotInferenceWindow = vi.fn(async () => ({
      character: {
        character_id: 101,
        name: "Pilot A",
        corporation_id: 1001,
        alliance_id: 2002,
        security_status: 2.1
      },
      kills: [],
      losses: [],
      zkillStats: null,
      inferenceKills: [],
      inferenceLosses: []
    }));
    const enrichStageOneRow = vi.fn();
    const loadDerivedInferenceWithCache = vi.fn();
    const ensureExplicitShipTypeId = vi.fn();

    const result = await fetchAndPrepareStageOne(
      {
        entry: ENTRY,
        characterId: 101,
        settings: { lookbackDays: 7 },
        topShips: 5,
        signal: undefined,
        onRetry: (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined,
        dogmaIndex: null,
        logDebug: vi.fn(),
        isCancelled: () => true
      },
      {
        fetchPilotInferenceWindow,
        derivePilotStats: vi.fn(() => ({
          kills: 0,
          losses: 0,
          kdRatio: 0,
          solo: 0,
          soloRatio: 0,
          iskDestroyed: 0,
          iskLost: 0,
          iskRatio: 0,
          danger: 0
        })),
        mergePilotStats: vi.fn(({ derived: stats }) => stats),
        enrichStageOneRow,
        loadDerivedInferenceWithCache,
        ensureExplicitShipTypeId
      }
    );

    expect(result).toBeNull();
    expect(fetchPilotInferenceWindow).toHaveBeenCalledTimes(1);
    expect(enrichStageOneRow).not.toHaveBeenCalled();
    expect(loadDerivedInferenceWithCache).not.toHaveBeenCalled();
    expect(ensureExplicitShipTypeId).not.toHaveBeenCalled();
  });
});
