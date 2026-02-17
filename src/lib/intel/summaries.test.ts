import { describe, expect, it } from "vitest";
import { summarizeEvidenceCoverage, summarizeTopEvidenceShips } from "./summaries";
import type { ZkillKillmail } from "../api/zkill";

describe("intel/summaries", () => {
  it("computes evidence coverage counts", () => {
    const characterId = 42;
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 1,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {},
        attackers: [],
        zkb: {}
      },
      {
        killmail_id: 2,
        killmail_time: "2026-02-09T00:00:00Z",
        victim: {},
        attackers: [{ character_id: characterId, ship_type_id: 100 }],
        zkb: {}
      }
    ];
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 3,
        killmail_time: "2026-02-08T00:00:00Z",
        victim: { character_id: characterId, ship_type_id: 200 },
        attackers: [],
        zkb: {}
      }
    ];

    const summary = summarizeEvidenceCoverage(characterId, kills, losses);
    expect(summary.killRowsWithoutAttackers).toBe(1);
    expect(summary.killRowsWithMatchedAttackerShip).toBe(1);
    expect(summary.lossRowsWithVictimShip).toBe(1);
  });

  it("orders top evidence ships by total activity", () => {
    const characterId = 9;
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 4,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {},
        attackers: [{ character_id: characterId, ship_type_id: 300 }],
        zkb: {}
      },
      {
        killmail_id: 5,
        killmail_time: "2026-02-09T00:00:00Z",
        victim: {},
        attackers: [{ character_id: characterId, ship_type_id: 301 }],
        zkb: {}
      }
    ];
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 6,
        killmail_time: "2026-02-08T00:00:00Z",
        victim: { character_id: characterId, ship_type_id: 301 },
        attackers: [],
        zkb: {}
      }
    ];

    const rows = summarizeTopEvidenceShips({
      characterId,
      kills,
      losses,
      shipNamesByTypeId: new Map([
        [300, "Ship A"],
        [301, "Ship B"]
      ])
    });

    expect(rows[0].shipTypeId).toBe(301);
    expect(rows[0].total).toBe(2);
  });
});
