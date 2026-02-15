import { describe, expect, it } from "vitest";
import { tuneScoringWeights } from "./backtest";
import type { ParsedPilotInput } from "../types";
import type { ZkillKillmail } from "./api/zkill";

function kill(
  id: number,
  time: string,
  characterId: number,
  shipTypeId: number
): ZkillKillmail {
  return {
    killmail_id: id,
    killmail_time: time,
    victim: {},
    attackers: [{ character_id: characterId, ship_type_id: shipTypeId }],
    zkb: {}
  };
}

describe("tuneScoringWeights", () => {
  it("returns best candidate ranked by hit rate", () => {
    const parsedEntry: ParsedPilotInput = {
      pilotName: "A9tan",
      sourceLine: "A9tan",
      parseConfidence: 0.9,
      shipSource: "inferred"
    };

    const samples = [
      {
        parsedEntry,
        characterId: 1,
        kills: [
          kill(1, "2026-02-14T00:00:00Z", 1, 100),
          kill(2, "2026-02-12T00:00:00Z", 1, 100),
          kill(3, "2026-02-10T00:00:00Z", 1, 200)
        ],
        losses: []
      }
    ];

    const result = tuneScoringWeights({
      samples,
      candidates: [
        { label: "baseline", weights: { lossEventWeight: 1.15, halfLifeDivisor: 2 } },
        { label: "alt", weights: { lossEventWeight: 1.0, halfLifeDivisor: 4 } }
      ],
      lookbackDays: 14,
      topN: 1,
      shipNamesByTypeId: new Map([
        [100, "Sabre"],
        [200, "Stabber"]
      ])
    });

    expect(result.best).not.toBeNull();
    expect(result.results).toHaveLength(2);
    expect(result.results[0].hitRate).toBeGreaterThanOrEqual(result.results[1].hitRate);
  });
});
