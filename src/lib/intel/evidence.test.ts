import { describe, expect, it } from "vitest";
import { collectEvidence } from "./evidence";
import type { ZkillKillmail } from "../api/zkill";

describe("intel/evidence", () => {
  it("collects matching attacker kills and character-scoped losses", () => {
    const characterId = 1234;
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 1,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {},
        attackers: [{ character_id: characterId, ship_type_id: 17703 }],
        zkb: {}
      },
      {
        killmail_id: 2,
        killmail_time: "2026-02-09T00:00:00Z",
        victim: {},
        attackers: [{ character_id: 9, ship_type_id: 111 }],
        zkb: {}
      }
    ];
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 3,
        killmail_time: "2026-02-08T00:00:00Z",
        victim: { character_id: characterId, ship_type_id: 11188 },
        attackers: [],
        zkb: {}
      },
      {
        killmail_id: 4,
        killmail_time: "2026-02-07T00:00:00Z",
        victim: { ship_type_id: 33468 },
        attackers: [],
        zkb: {}
      }
    ];

    const rows = collectEvidence(characterId, kills, losses);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.shipTypeId).sort((a, b) => a - b)).toEqual([11188, 17703, 33468]);
    expect(rows.filter((row) => row.eventType === "kill")).toHaveLength(1);
    expect(rows.filter((row) => row.eventType === "loss")).toHaveLength(2);
  });
});
