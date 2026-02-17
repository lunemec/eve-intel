import { describe, expect, it } from "vitest";
import { buildStageOneRow, buildStageTwoRow } from "./rows";
import type { ParsedPilotInput } from "../../types";

const ENTRY: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

describe("pipeline/rows", () => {
  it("builds stage one row with enriching phase and affiliation names", () => {
    const row = buildStageOneRow({
      entry: ENTRY,
      characterId: 101,
      character: {
        name: "Pilot A",
        corporation_id: 1001,
        alliance_id: 2002,
        security_status: 1.2
      },
      namesById: new Map([
        [1001, "Corp X"],
        [2002, "Alliance Y"]
      ]),
      stats: {
        kills: 1,
        losses: 2,
        kdRatio: 0.5,
        solo: 0,
        soloRatio: 0,
        iskDestroyed: 10,
        iskLost: 20,
        iskRatio: 0.5,
        danger: 20
      },
      kills: [],
      losses: [],
      inferenceKills: [],
      inferenceLosses: []
    });

    expect(row.status).toBe("ready");
    expect(row.fetchPhase).toBe("enriching");
    expect(row.corporationName).toBe("Corp X");
    expect(row.allianceName).toBe("Alliance Y");
  });

  it("builds stage two row with ready phase and merged inference", () => {
    const stageOne = buildStageOneRow({
      entry: ENTRY,
      characterId: 101,
      character: {
        name: "Pilot A",
        corporation_id: 1001,
        alliance_id: 2002,
        security_status: 1.2
      },
      namesById: new Map([
        [1001, "Corp X"],
        [2002, "Alliance Y"]
      ]),
      stats: {
        kills: 1,
        losses: 2,
        kdRatio: 0.5,
        solo: 0,
        soloRatio: 0,
        iskDestroyed: 10,
        iskLost: 20,
        iskRatio: 0.5,
        danger: 20
      },
      kills: [],
      losses: [],
      inferenceKills: [],
      inferenceLosses: []
    });

    const stageTwo = buildStageTwoRow({
      stageOne,
      character: {
        corporation_id: 1001,
        alliance_id: 2002
      },
      namesById: new Map([
        [1001, "Corp Z"],
        [2002, "Alliance W"]
      ]),
      inferenceKills: [{ killmail_id: 1, killmail_time: "2026-01-01T00:00:00Z", victim: {}, attackers: [], zkb: {} }],
      inferenceLosses: []
    });

    expect(stageTwo.fetchPhase).toBe("ready");
    expect(stageTwo.corporationName).toBe("Corp Z");
    expect(stageTwo.allianceName).toBe("Alliance W");
    expect(stageTwo.inferenceKills).toHaveLength(1);
    expect(stageTwo.status).toBe("ready");
  });
});
