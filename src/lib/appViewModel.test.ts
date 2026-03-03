import { describe, expect, it } from "vitest";
import type { ZkillKillmail } from "./api/zkill";
import type { PilotCard } from "./pilotDomain";
import {
  deriveAppViewModel,
  sortPilotCardsByDanger,
  sortPilotCardsForFleetView
} from "./appViewModel";

function pilot(overrides: Partial<PilotCard> = {}): PilotCard {
  return {
    parsedEntry: {
      pilotName: "Pilot A",
      sourceLine: "Pilot A",
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "loading",
    fetchPhase: "loading",
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: [],
    ...overrides
  };
}

describe("deriveAppViewModel", () => {
  it("computes copyable fleet count from finite character IDs", () => {
    const result = deriveAppViewModel([
      pilot({ characterId: 100 }),
      pilot({ characterId: Number.NaN }),
      pilot({ characterId: 0 }),
      pilot({ characterId: undefined })
    ]);

    expect(result.copyableFleetCount).toBe(2);
  });

  it("hides global load when there are no pilot cards", () => {
    const result = deriveAppViewModel([]);
    expect(result.globalLoadProgress).toBe(1);
    expect(result.showGlobalLoad).toBe(false);
  });

  it("shows global load while aggregated progress is not complete", () => {
    const result = deriveAppViewModel([
      pilot({ status: "loading", fetchPhase: "loading" }),
      pilot({ status: "ready", fetchPhase: "ready" })
    ]);

    expect(result.globalLoadProgress).toBeLessThan(1);
    expect(result.showGlobalLoad).toBe(true);
  });

  it("hides global load when all pilots are complete", () => {
    const result = deriveAppViewModel([
      pilot({ status: "ready", fetchPhase: "ready", characterId: 100 }),
      pilot({ status: "error", fetchPhase: "error", characterId: 200 })
    ]);

    expect(result.globalLoadProgress).toBe(1);
    expect(result.showGlobalLoad).toBe(false);
  });
});

describe("sortPilotCardsByDanger", () => {
  it("sorts by danger descending and puts missing danger last", () => {
    const rows = [
      pilot({ parsedEntry: { ...pilot().parsedEntry, pilotName: "Charlie" }, stats: { danger: 25 } as PilotCard["stats"] }),
      pilot({ parsedEntry: { ...pilot().parsedEntry, pilotName: "Zulu" }, stats: {} as PilotCard["stats"] }),
      pilot({ parsedEntry: { ...pilot().parsedEntry, pilotName: "Alpha" }, stats: { danger: 90 } as PilotCard["stats"] })
    ];

    const sorted = sortPilotCardsByDanger(rows);
    expect(sorted.map((row) => row.parsedEntry.pilotName)).toEqual(["Alpha", "Charlie", "Zulu"]);
  });

  it("breaks equal-danger ties alphabetically (case-insensitive)", () => {
    const rows = [
      pilot({ parsedEntry: { ...pilot().parsedEntry, pilotName: "bravo" }, stats: { danger: 50 } as PilotCard["stats"] }),
      pilot({ parsedEntry: { ...pilot().parsedEntry, pilotName: "Alpha" }, stats: { danger: 50 } as PilotCard["stats"] })
    ];

    const sorted = sortPilotCardsByDanger(rows);
    expect(sorted.map((row) => row.parsedEntry.pilotName)).toEqual(["Alpha", "bravo"]);
  });
});

describe("sortPilotCardsForFleetView", () => {
  it("prefers grouped ordering when grouping produces ordered pilot ids", () => {
    const alphaId = 2001;
    const zuluId = 2002;
    const rows = [
      pilot({
        characterId: zuluId,
        characterName: "Zulu Pilot",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Zulu Pilot" },
        stats: { danger: 95 } as PilotCard["stats"],
        inferenceKills: []
      }),
      pilot({
        characterId: alphaId,
        characterName: "Alpha Pilot",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Alpha Pilot" },
        stats: { danger: 5 } as PilotCard["stats"],
        inferenceKills: killmailSeries(9000, 12, () => [alphaId, zuluId])
      })
    ];

    const ordered = sortPilotCardsForFleetView(rows);
    expect(ordered.map((row) => row.characterName ?? row.parsedEntry.pilotName)).toEqual([
      "Alpha Pilot",
      "Zulu Pilot"
    ]);
  });

  it("falls back to danger ordering when grouping has no ordered ids", () => {
    const rows = [
      pilot({
        characterId: 3001,
        characterName: "Zulu Pilot",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Zulu Pilot" },
        stats: { danger: 90 } as PilotCard["stats"],
        inferenceKills: []
      }),
      pilot({
        characterId: 3002,
        characterName: "Alpha Pilot",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Alpha Pilot" },
        stats: { danger: 25 } as PilotCard["stats"],
        inferenceKills: []
      })
    ];

    const ordered = sortPilotCardsForFleetView(rows);
    expect(ordered.map((row) => row.characterName ?? row.parsedEntry.pilotName)).toEqual([
      "Zulu Pilot",
      "Alpha Pilot"
    ]);
  });
});

function killmailSeries(startKillmailId: number, count: number, attackersForIndex: (index: number) => number[]): ZkillKillmail[] {
  return Array.from({ length: count }, (_, index) => ({
    killmail_id: startKillmailId + index,
    killmail_time: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    victim: {},
    attackers: attackersForIndex(index).map((characterId) => ({ character_id: characterId }))
  }));
}
