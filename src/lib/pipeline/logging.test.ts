import { describe, expect, it } from "vitest";
import { buildDeepHistoryMergedLog, buildFetchedZkillDataLog, buildFallbackInferenceLog } from "./logging";

describe("pipeline/logging", () => {
  it("builds fallback inference log payload", () => {
    expect(
      buildFallbackInferenceLog({
        pilot: "Pilot A",
        characterId: 101,
        fallbackKills: 50,
        fallbackLosses: 12
      })
    ).toEqual({
      pilot: "Pilot A",
      characterId: 101,
      fallbackKills: 50,
      fallbackLosses: 12
    });
  });

  it("builds fetched zkill log payload", () => {
    expect(
      buildFetchedZkillDataLog({
        pilot: "Pilot A",
        characterId: 101,
        kills: 10,
        losses: 2,
        hasZkillStats: true
      })
    ).toEqual({
      pilot: "Pilot A",
      characterId: 101,
      kills: 10,
      losses: 2,
      zkillStats: true
    });
  });

  it("builds deep history merged log payload", () => {
    expect(
      buildDeepHistoryMergedLog({
        pilot: "Pilot A",
        inferenceKills: 1000,
        inferenceLosses: 55
      })
    ).toEqual({
      pilot: "Pilot A",
      inferenceKills: 1000,
      inferenceLosses: 55
    });
  });
});
