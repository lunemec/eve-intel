import { describe, expect, it, vi } from "vitest";
import { enrichStageTwoRow } from "./stageTwoEnrichment";
import type { PilotCard } from "../usePilotIntelPipeline";
import type { ParsedPilotInput } from "../../types";

const ENTRY: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
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

describe("pipeline/stageTwoEnrichment", () => {
  it("resolves stage-two names and builds enriched stage-two row", async () => {
    const onRetry = (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined;
    const logDebug = vi.fn();
    const resolveNamesSafely = vi.fn(async () => new Map([[1001, "Corp X"], [2002, "Alliance Y"]]));
    const buildStageTwoRow = vi.fn((args: {
      stageOne: PilotCard;
      character: { corporation_id: number; alliance_id?: number };
      namesById: Map<number, string>;
      inferenceKills: PilotCard["inferenceKills"];
      inferenceLosses: PilotCard["inferenceLosses"];
    }) => ({
      ...args.stageOne,
      fetchPhase: "ready" as const,
      corporationName: args.namesById.get(1001),
      allianceName: args.namesById.get(2002),
      inferenceKills: args.inferenceKills,
      inferenceLosses: args.inferenceLosses
    }));

    const { stageTwoRow, namesById } = await enrichStageTwoRow(
      {
        characterId: 101,
        character: { corporation_id: 1001, alliance_id: 2002 },
        inferenceKills: [{ killmail_id: 1, killmail_time: "2026-01-01T00:00:00Z", victim: {}, attackers: [], zkb: {} }],
        inferenceLosses: [],
        stageOneRow: makeStageOneRow(),
        signal: undefined,
        onRetry,
        dogmaIndex: null,
        logDebug
      },
      {
        collectStageNameResolutionIds: vi.fn(() => [1001, 2002]),
        resolveNamesSafely,
        buildStageTwoRow
      }
    );

    expect(resolveNamesSafely).toHaveBeenCalledTimes(1);
    expect(buildStageTwoRow).toHaveBeenCalledTimes(1);
    expect(stageTwoRow.fetchPhase).toBe("ready");
    expect(stageTwoRow.corporationName).toBe("Corp X");
    expect(stageTwoRow.allianceName).toBe("Alliance Y");
    expect(stageTwoRow.inferenceKills).toHaveLength(1);
    expect(namesById.get(1001)).toBe("Corp X");
  });
});
