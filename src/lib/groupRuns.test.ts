import { describe, expect, it } from "vitest";
import type { GroupPresentation } from "./appViewModel";
import type { PilotCard } from "./pilotDomain";
import { deriveGroupRunPositionsByIndex } from "./groupRuns";

function pilot(characterId: number): PilotCard {
  const name = `Pilot ${characterId}`;
  return {
    parsedEntry: {
      pilotName: name,
      sourceLine: name,
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "ready",
    fetchPhase: "ready",
    characterId,
    characterName: name,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

describe("deriveGroupRunPositionsByIndex", () => {
  it("marks contiguous grouped pilots as start/middle/end", () => {
    const pilots = [pilot(1), pilot(2), pilot(3), pilot(4)];
    const groupPresentationByPilotId = new Map<number, GroupPresentation>([
      [1, { groupId: "g-alpha", isGreyedSuggestion: false, isUngrouped: false }],
      [2, { groupId: "g-alpha", isGreyedSuggestion: false, isUngrouped: false }],
      [3, { groupId: "g-alpha", isGreyedSuggestion: true, isUngrouped: false }]
    ]);

    expect(deriveGroupRunPositionsByIndex(pilots, groupPresentationByPilotId)).toEqual([
      "start",
      "middle",
      "end",
      undefined
    ]);
  });

  it("marks isolated grouped pilots as single when separated by other groups", () => {
    const pilots = [pilot(11), pilot(22), pilot(33)];
    const groupPresentationByPilotId = new Map<number, GroupPresentation>([
      [11, { groupId: "g-one", isGreyedSuggestion: false, isUngrouped: false }],
      [22, { groupId: "g-two", isGreyedSuggestion: false, isUngrouped: false }],
      [33, { groupId: "g-one", isGreyedSuggestion: false, isUngrouped: false }]
    ]);

    expect(deriveGroupRunPositionsByIndex(pilots, groupPresentationByPilotId)).toEqual([
      "single",
      "single",
      "single"
    ]);
  });
});
