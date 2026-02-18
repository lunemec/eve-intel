import { describe, expect, it, vi } from "vitest";
import { enrichStageOneRow } from "./stageOneEnrichment";
import type { ParsedPilotInput } from "../../types";
import type { PilotStats } from "../intel";
import type { ZkillKillmail } from "../api/zkill";

const ENTRY: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

const STATS: PilotStats = {
  kills: 1,
  losses: 0,
  kdRatio: 1,
  solo: 0,
  soloRatio: 0,
  iskDestroyed: 1,
  iskLost: 0,
  iskRatio: 1,
  danger: 100
};

describe("pipeline/stageOneEnrichment", () => {
  it("resolves names and builds stage-one row", async () => {
    const resolveNamesSafely = vi.fn(async () => new Map([[1001, "Corp A"], [2002, "Alliance A"]]));
    const buildStageOneRow = vi.fn((args: {
      entry: ParsedPilotInput;
      characterId: number;
      character: {
        name: string;
        corporation_id: number;
        alliance_id?: number;
        security_status?: number;
      };
      namesById: Map<number, string>;
      stats: PilotStats;
      kills: ZkillKillmail[];
      losses: ZkillKillmail[];
      inferenceKills: ZkillKillmail[];
      inferenceLosses: ZkillKillmail[];
    }) => ({
      parsedEntry: args.entry,
      status: "ready" as const,
      fetchPhase: "enriching" as const,
      characterId: args.characterId,
      characterName: args.character.name,
      corporationId: args.character.corporation_id,
      corporationName: args.namesById.get(args.character.corporation_id),
      allianceId: args.character.alliance_id,
      allianceName: args.character.alliance_id ? args.namesById.get(args.character.alliance_id) : undefined,
      securityStatus: args.character.security_status,
      stats: args.stats,
      predictedShips: [],
      fitCandidates: [],
      kills: args.kills,
      losses: args.losses,
      inferenceKills: args.inferenceKills,
      inferenceLosses: args.inferenceLosses
    }));

    const result = await enrichStageOneRow(
      {
        entry: ENTRY,
        characterId: 101,
        character: {
          name: "Pilot A",
          corporation_id: 1001,
          alliance_id: 2002,
          security_status: 2.1
        },
        stats: STATS,
        kills: [],
        losses: [],
        inferenceKills: [],
        inferenceLosses: [],
        signal: undefined,
        onRetry: () => () => undefined,
        dogmaIndex: null,
        logDebug: vi.fn()
      },
      {
        collectStageNameResolutionIds: vi.fn(() => [1001, 2002]),
        resolveNamesSafely,
        buildStageOneRow
      }
    );

    expect(resolveNamesSafely).toHaveBeenCalledTimes(1);
    expect(buildStageOneRow).toHaveBeenCalledTimes(1);
    expect(result.namesById.get(1001)).toBe("Corp A");
    expect(result.stageOneRow.fetchPhase).toBe("enriching");
    expect(result.stageOneRow.corporationName).toBe("Corp A");
  });
});
