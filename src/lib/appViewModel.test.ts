import { describe, expect, it } from "vitest";
import type { ZkillKillmail } from "./api/zkill";
import type { PilotCard } from "./pilotDomain";
import {
  deriveGroupPresentationByPilotId,
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
  it("prioritizes grouped pilots first, orders groups by weighted confidence, and keeps in-group danger sorting", () => {
    const highConfidenceLowDangerA = 2001;
    const highConfidenceLowDangerB = 2002;
    const lowConfidenceHighDangerA = 2003;
    const lowConfidenceHighDangerB = 2004;
    const ungroupedHighestDanger = 2005;
    const rows = [
      pilot({
        characterId: highConfidenceLowDangerA,
        characterName: "High Group Anchor",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "High Group Anchor" },
        stats: { danger: 20 } as PilotCard["stats"],
        inferenceKills: killmailSeries(9_100, 20, (index) =>
          index < 19
            ? [highConfidenceLowDangerA, highConfidenceLowDangerB]
            : [highConfidenceLowDangerA]
        )
      }),
      pilot({
        characterId: highConfidenceLowDangerB,
        characterName: "High Group Wing",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "High Group Wing" },
        stats: { danger: 60 } as PilotCard["stats"],
        inferenceKills: []
      }),
      pilot({
        characterId: lowConfidenceHighDangerA,
        characterName: "Low Group Anchor",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Low Group Anchor" },
        stats: { danger: 90 } as PilotCard["stats"],
        inferenceKills: killmailSeries(9_200, 20, (index) =>
          index < 17
            ? [lowConfidenceHighDangerA, lowConfidenceHighDangerB]
            : [lowConfidenceHighDangerA]
        )
      }),
      pilot({
        characterId: lowConfidenceHighDangerB,
        characterName: "Low Group Wing",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Low Group Wing" },
        stats: { danger: 80 } as PilotCard["stats"],
        inferenceKills: []
      }),
      pilot({
        characterId: ungroupedHighestDanger,
        characterName: "Ungrouped Apex",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Ungrouped Apex" },
        stats: { danger: 99 } as PilotCard["stats"],
        inferenceKills: []
      })
    ];

    const ordered = sortPilotCardsForFleetView(rows);
    expect(ordered.map((row) => row.characterName ?? row.parsedEntry.pilotName)).toEqual([
      "High Group Wing",
      "High Group Anchor",
      "Low Group Anchor",
      "Low Group Wing",
      "Ungrouped Apex"
    ]);
  });

  it("uses danger ordering when pilots have no grouping evidence", () => {
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

describe("deriveGroupPresentationByPilotId", () => {
  it("marks grouped pilots with shared group id and ungrouped pilots explicitly", () => {
    const alphaId = 4001;
    const bravoId = 4002;
    const zuluId = 4003;
    const rows = [
      pilot({
        characterId: alphaId,
        characterName: "Alpha Pilot",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Alpha Pilot" },
        stats: { danger: 80 } as PilotCard["stats"],
        inferenceKills: killmailSeries(9100, 12, () => [alphaId, bravoId])
      }),
      pilot({
        characterId: bravoId,
        characterName: "Bravo Pilot",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Bravo Pilot" },
        stats: { danger: 70 } as PilotCard["stats"],
        inferenceKills: []
      }),
      pilot({
        characterId: zuluId,
        characterName: "Zulu Pilot",
        parsedEntry: { ...pilot().parsedEntry, pilotName: "Zulu Pilot" },
        stats: { danger: 10 } as PilotCard["stats"],
        inferenceKills: []
      })
    ];

    const presentationByPilotId = deriveGroupPresentationByPilotId(rows);
    const alphaPresentation = presentationByPilotId.get(alphaId);
    const bravoPresentation = presentationByPilotId.get(bravoId);
    const zuluPresentation = presentationByPilotId.get(zuluId);

    expect(alphaPresentation?.groupId).toBeTruthy();
    expect(bravoPresentation?.groupId).toBe(alphaPresentation?.groupId);
    expect(alphaPresentation?.groupColorToken).toMatch(/^fleet-group-color-\d+$/);
    expect(bravoPresentation?.groupColorToken).toBe(alphaPresentation?.groupColorToken);
    expect(alphaPresentation?.isUngrouped).toBe(false);
    expect(bravoPresentation?.isUngrouped).toBe(false);
    expect(alphaPresentation?.isGreyedSuggestion).toBe(false);
    expect(bravoPresentation?.isGreyedSuggestion).toBe(false);

    expect(zuluPresentation).toEqual({
      isGreyedSuggestion: false,
      isUngrouped: true
    });
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
