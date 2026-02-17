import { describe, expect, it } from "vitest";
import { buildRetryNotice, collectStageNameResolutionIds } from "./stages";
import type { ZkillKillmail } from "../api/zkill";

describe("pipeline/stages", () => {
  it("collects stage name resolution ids from evidence, items and affiliations", () => {
    const characterId = 777;
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 1,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {},
        attackers: [{ character_id: characterId, ship_type_id: 111 }],
        zkb: {}
      }
    ];
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 2,
        killmail_time: "2026-02-09T00:00:00Z",
        victim: {
          character_id: characterId,
          ship_type_id: 222,
          items: [{ item_type_id: 333 }]
        },
        attackers: [],
        zkb: {}
      }
    ];

    const ids = collectStageNameResolutionIds({
      characterId,
      inferenceKills: kills,
      inferenceLosses: losses,
      corporationId: 444,
      allianceId: 555
    });

    expect(ids).toEqual([111, 222, 333, 444, 555]);
  });

  it("formats retry notice message", () => {
    expect(buildRetryNotice("zKill kills", { status: 429, attempt: 2, delayMs: 1500 })).toBe(
      "zKill kills: rate-limited/retryable response (429), retry 2 in 1500ms"
    );
  });
});
