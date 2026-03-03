import { describe, expect, it } from "vitest";
import type { ZkillKillmail } from "./api/zkill";
import {
  buildFleetGroupingSourceSignature,
  computeFleetGrouping,
  createEmptyFleetGroupingState,
  stableFleetGroupId
} from "./fleetGrouping";
import type { PilotCard } from "./pilotDomain";

describe("fleetGrouping", () => {
  it("creates stable empty state payload", () => {
    const state = createEmptyFleetGroupingState({
      generatedAtMs: 123,
      sourceSignature: "signature-v1"
    });

    expect(state).toEqual({
      version: 1,
      groups: [],
      suggestions: [],
      orderedPilotIds: [],
      generatedAtMs: 123,
      sourceSignature: "signature-v1"
    });
  });

  it("normalizes selected ids in source signature", () => {
    expect(buildFleetGroupingSourceSignature([7, 2, 7, 0, -1, Number.NaN, 4])).toBe(
      "fleet-grouping-v1|selected:2,4,7"
    );
    expect(buildFleetGroupingSourceSignature([])).toBe("fleet-grouping-v1|selected:");
  });

  it("creates deterministic group ids independent of member order", () => {
    const first = stableFleetGroupId([300, 100, 200, 100]);
    const second = stableFleetGroupId([200, 300, 100]);

    expect(first).toBe(second);
    expect(first).toMatch(/^fleet-group-v1-[0-9a-f]{8}$/);
  });

  it("returns stable empty output from skeleton compute path", () => {
    const output = computeFleetGrouping({
      selectedPilotIds: [9, 3, 9],
      pilotCardsById: new Map(),
      allKnownPilotNamesById: new Map(),
      nowMs: 456
    });

    expect(output.orderedPilotIds).toEqual([]);
    expect(output.groups).toEqual([]);
    expect(output.suggestions).toEqual([]);
    expect(output.state).toEqual({
      version: 1,
      groups: [],
      suggestions: [],
      orderedPilotIds: [],
      generatedAtMs: 456,
      sourceSignature: "fleet-grouping-v1|selected:3,9"
    });
  });

  it("enforces strict ratio boundary (>80%) for visible suggestions", () => {
    const anchorId = 1001;
    const candidate799 = 2001;
    const candidate800 = 2002;
    const candidate801 = 2003;

    const kills = Array.from({ length: 1000 }, (_, index) => {
      const attackers = [anchorId];
      if (index < 799) {
        attackers.push(candidate799);
      }
      if (index < 800) {
        attackers.push(candidate800);
      }
      if (index < 801) {
        attackers.push(candidate801);
      }
      return killmail(index + 1, attackers);
    });

    const output = computeFleetGrouping({
      selectedPilotIds: [anchorId],
      pilotCardsById: new Map([[anchorId, pilotCard(anchorId, "Anchor One", kills)]]),
      allKnownPilotNamesById: new Map([
        [candidate799, "Cand 79.9"],
        [candidate800, "Cand 80.0"],
        [candidate801, "Cand 80.1"]
      ]),
      nowMs: 100
    });

    expect(output.suggestions.map((row) => row.characterId)).toEqual([candidate801]);

    const byCandidateId = new Map(output.state.suggestions.map((row) => [row.characterId, row]));
    expect(byCandidateId.get(candidate799)).toMatchObject({
      characterId: candidate799,
      strongestRatio: 0.799,
      strongestSharedKillCount: 799,
      eligible: false
    });
    expect(byCandidateId.get(candidate800)).toMatchObject({
      characterId: candidate800,
      strongestRatio: 0.8,
      strongestSharedKillCount: 800,
      eligible: false
    });
    expect(byCandidateId.get(candidate801)).toMatchObject({
      characterId: candidate801,
      strongestRatio: 0.801,
      strongestSharedKillCount: 801,
      eligible: true
    });
  });

  it("requires at least 10 shared killmails for visibility even when ratio passes", () => {
    const anchorId = 3001;
    const candidate9 = 3002;
    const candidate10 = 3003;

    const kills = Array.from({ length: 10 }, (_, index) =>
      killmail(index + 1, [anchorId, ...(index < 9 ? [candidate9] : []), candidate10])
    );

    const output = computeFleetGrouping({
      selectedPilotIds: [anchorId],
      pilotCardsById: new Map([[anchorId, pilotCard(anchorId, "Anchor Two", kills)]]),
      allKnownPilotNamesById: new Map([
        [candidate9, "Cand Shared9"],
        [candidate10, "Cand Shared10"]
      ]),
      nowMs: 200
    });

    expect(output.suggestions.map((row) => row.characterId)).toEqual([candidate10]);

    const byCandidateId = new Map(output.state.suggestions.map((row) => [row.characterId, row]));
    expect(byCandidateId.get(candidate9)).toMatchObject({
      characterId: candidate9,
      strongestRatio: 0.9,
      strongestSharedKillCount: 9,
      eligible: false
    });
    expect(byCandidateId.get(candidate10)).toMatchObject({
      characterId: candidate10,
      strongestRatio: 1,
      strongestSharedKillCount: 10,
      eligible: true
    });
  });

  it("keeps co-fly extraction scoped per selected pilot (no fleet-wide bleed)", () => {
    const selectedAlpha = 4001;
    const selectedBravo = 4002;
    const candidate = 4999;

    const alphaKills = Array.from({ length: 10 }, (_, index) => killmail(index + 1, [selectedAlpha, candidate]));
    const bravoKills = Array.from({ length: 100 }, (_, index) => killmail(1000 + index + 1, [selectedBravo]));

    const output = computeFleetGrouping({
      selectedPilotIds: [selectedAlpha, selectedBravo],
      pilotCardsById: new Map([
        [selectedAlpha, pilotCard(selectedAlpha, "Selected Alpha", alphaKills)],
        [selectedBravo, pilotCard(selectedBravo, "Selected Bravo", bravoKills)]
      ]),
      allKnownPilotNamesById: new Map([[candidate, "Scoped Candidate"]]),
      nowMs: 300
    });

    expect(output.suggestions).toHaveLength(1);
    expect(output.suggestions[0]).toMatchObject({
      characterId: candidate,
      sourcePilotIds: [selectedAlpha],
      strongestRatio: 1,
      strongestSharedKillCount: 10,
      eligible: true
    });
  });

  it("builds connected components and orders selected pilots before suggested pilots", () => {
    const selectedAlpha = 5001;
    const selectedBravo = 5002;
    const suggestedCharlie = 5003;

    const alphaKills = killmailSeries(50000, 12, () => [selectedAlpha, selectedBravo]);
    const bravoKills = killmailSeries(51000, 12, () => [selectedBravo, suggestedCharlie]);

    const output = computeFleetGrouping({
      selectedPilotIds: [selectedBravo, selectedAlpha],
      pilotCardsById: new Map([
        [selectedBravo, pilotCard(selectedBravo, "Bravo Anchor", bravoKills)],
        [selectedAlpha, pilotCard(selectedAlpha, "Alpha Anchor", alphaKills)]
      ]),
      allKnownPilotNamesById: new Map([[suggestedCharlie, "Charlie Wing"]]),
      nowMs: 400
    });

    expect(output.suggestions.map((suggestion) => suggestion.characterId)).toEqual([suggestedCharlie]);
    expect(output.groups).toHaveLength(1);
    expect(output.groups[0]).toMatchObject({
      groupId: stableFleetGroupId([selectedAlpha, selectedBravo, suggestedCharlie]),
      memberPilotIds: [selectedAlpha, selectedBravo, suggestedCharlie],
      selectedPilotIds: [selectedAlpha, selectedBravo],
      suggestedPilotIds: [suggestedCharlie],
      weightedConfidence: 1
    });
    expect(output.orderedPilotIds).toEqual([selectedAlpha, selectedBravo, suggestedCharlie]);
    expect(output.state.groups).toEqual(output.groups);
    expect(output.state.orderedPilotIds).toEqual(output.orderedPilotIds);
  });

  it("suppresses suggested-only components from displayed groups", () => {
    const selectedAnchor = 6101;
    const suggestedDelta = 6201;
    const suggestedEcho = 6202;

    const anchorKills = killmailSeries(62000, 12, () => [
      selectedAnchor,
      suggestedDelta,
      suggestedEcho
    ]);

    const output = computeFleetGrouping({
      selectedPilotIds: [selectedAnchor],
      pilotCardsById: new Map([[selectedAnchor, pilotCard(selectedAnchor, "Anchor", anchorKills)]]),
      allKnownPilotNamesById: new Map([
        [suggestedDelta, "Delta Wing"],
        [suggestedEcho, "Echo Wing"]
      ]),
      nowMs: 500
    });

    expect(output.groups).toHaveLength(1);
    expect(output.groups[0]).toMatchObject({
      memberPilotIds: [selectedAnchor, suggestedDelta, suggestedEcho],
      selectedPilotIds: [selectedAnchor],
      suggestedPilotIds: [suggestedDelta, suggestedEcho]
    });
    expect(output.groups.every((group) => group.selectedPilotIds.length > 0)).toBe(true);
  });

  it("uses deterministic alphabetical tie-breaks for equal-strength groups", () => {
    const selectedZulu = 7101;
    const selectedAlpha = 7201;
    const suggestedZulu = 7102;
    const suggestedAlpha = 7202;

    const zuluKills = killmailSeries(71000, 10, () => [selectedZulu, suggestedZulu]);
    const alphaKills = killmailSeries(72000, 10, () => [selectedAlpha, suggestedAlpha]);

    const outputA = computeFleetGrouping({
      selectedPilotIds: [selectedZulu, selectedAlpha],
      pilotCardsById: new Map([
        [selectedZulu, pilotCard(selectedZulu, "Zulu Anchor", zuluKills)],
        [selectedAlpha, pilotCard(selectedAlpha, "Alpha Anchor", alphaKills)]
      ]),
      allKnownPilotNamesById: new Map([
        [suggestedZulu, "Zulu Wing"],
        [suggestedAlpha, "Alpha Wing"]
      ]),
      nowMs: 600
    });

    const outputB = computeFleetGrouping({
      selectedPilotIds: [selectedAlpha, selectedZulu],
      pilotCardsById: new Map([
        [selectedAlpha, pilotCard(selectedAlpha, "Alpha Anchor", alphaKills)],
        [selectedZulu, pilotCard(selectedZulu, "Zulu Anchor", zuluKills)]
      ]),
      allKnownPilotNamesById: new Map([
        [suggestedAlpha, "Alpha Wing"],
        [suggestedZulu, "Zulu Wing"]
      ]),
      nowMs: 601
    });

    expect(outputA.orderedPilotIds).toEqual([selectedAlpha, suggestedAlpha, selectedZulu, suggestedZulu]);
    expect(outputB.orderedPilotIds).toEqual(outputA.orderedPilotIds);
    expect(outputA.groups.map((group) => group.groupId)).toEqual([
      stableFleetGroupId([selectedAlpha, suggestedAlpha]),
      stableFleetGroupId([selectedZulu, suggestedZulu])
    ]);
    expect(outputB.groups.map((group) => group.groupId)).toEqual(outputA.groups.map((group) => group.groupId));
  });
});

function pilotCard(characterId: number, pilotName: string, inferenceKills: ZkillKillmail[]): PilotCard {
  return {
    parsedEntry: {
      pilotName,
      sourceLine: pilotName,
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "ready",
    characterId,
    characterName: pilotName,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills,
    inferenceLosses: []
  };
}

function killmail(killmailId: number, attackerCharacterIds: number[]): ZkillKillmail {
  return {
    killmail_id: killmailId,
    killmail_time: `2026-01-${String((killmailId % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    victim: {},
    attackers: attackerCharacterIds.map((characterId) => ({ character_id: characterId }))
  };
}

function killmailSeries(startKillmailId: number, count: number, attackersForIndex: (index: number) => number[]): ZkillKillmail[] {
  return Array.from({ length: count }, (_, index) =>
    killmail(startKillmailId + index, attackersForIndex(index))
  );
}
