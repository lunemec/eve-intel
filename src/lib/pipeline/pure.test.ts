import { describe, expect, it } from "vitest";
import { buildDerivedInferenceKey, isDerivedInferenceUsable, mergeKillmailLists, mergePilotStats } from "./pure";

describe("pipeline pure helpers", () => {
  it("deduplicates and orders merged killmail lists by time", () => {
    const older = {
      killmail_id: 1,
      killmail_time: "2024-01-01T00:00:00Z",
      victim: {}
    };
    const newer = {
      killmail_id: 2,
      killmail_time: "2024-02-01T00:00:00Z",
      victim: {}
    };
    const dupeNewer = {
      killmail_id: 2,
      killmail_time: "2024-02-01T00:00:00Z",
      victim: {}
    };

    const merged = mergeKillmailLists([older, newer], [dupeNewer]);
    expect(merged.map((row) => row.killmail_id)).toEqual([2, 1]);
  });

  it("builds deterministic inference cache keys", () => {
    const keyA = buildDerivedInferenceKey({
      characterId: 99,
      lookbackDays: 7,
      topShips: 5,
      explicitShip: "Drake",
      kills: [{ killmail_id: 10, killmail_time: "2024-01-01T00:00:00Z", victim: {} }],
      losses: [{ killmail_id: 20, killmail_time: "2024-01-02T00:00:00Z", victim: {} }]
    });
    const keyB = buildDerivedInferenceKey({
      characterId: 99,
      lookbackDays: 7,
      topShips: 5,
      explicitShip: "Drake",
      kills: [{ killmail_id: 10, killmail_time: "2024-01-01T00:00:00Z", victim: {} }],
      losses: [{ killmail_id: 20, killmail_time: "2024-01-02T00:00:00Z", victim: {} }]
    });

    expect(keyA).toBe(keyB);
    expect(keyA).toContain("derived.inference.v7");
  });

  it("checks derived inference usability including explicit ship pinning", () => {
    const value = {
      predictedShips: [{ shipName: "Drake", probability: 100, source: "explicit" as const, reason: [] }],
      fitCandidates: [],
      cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] }
    };

    expect(isDerivedInferenceUsable(value, undefined)).toBe(true);
    expect(isDerivedInferenceUsable(value, "Drake")).toBe(true);
    expect(isDerivedInferenceUsable(value, "Caracal")).toBe(false);
  });

  it("merges derived and zkill stats with zkill-preferred fields", () => {
    const merged = mergePilotStats({
      derived: {
        kills: 1,
        losses: 2,
        kdRatio: 0.5,
        solo: 0,
        soloRatio: 0,
        iskDestroyed: 100,
        iskLost: 200,
        iskRatio: 0.5,
        danger: 33.3
      },
      zkillStats: {
        kills: 4,
        losses: 1,
        solo: 2,
        avgGangSize: 3.6,
        gangRatio: 98,
        danger: 99,
        iskDestroyed: 900,
        iskLost: 300
      }
    });

    expect(merged.kills).toBe(4);
    expect(merged.losses).toBe(1);
    expect(merged.solo).toBe(2);
    expect(merged.avgGangSize).toBe(3.6);
    expect(merged.gangRatio).toBe(98);
    expect(merged.iskDestroyed).toBe(900);
    expect(merged.iskLost).toBe(300);
    expect(merged.kdRatio).toBe(4);
    expect(merged.iskRatio).toBe(3);
    expect(merged.danger).toBe(99);
  });

  it("falls back to derived danger when zkill danger is missing", () => {
    const merged = mergePilotStats({
      derived: {
        kills: 2,
        losses: 8,
        kdRatio: 0.25,
        solo: 0,
        soloRatio: 0,
        iskDestroyed: 100,
        iskLost: 400,
        iskRatio: 0.25,
        danger: 20
      },
      zkillStats: {
        kills: 4,
        losses: 1,
        solo: 2,
        iskDestroyed: 900,
        iskLost: 300
      }
    });

    expect(merged.danger).toBe(80);
    expect(merged.gangRatio).toBe(50);
  });
});
