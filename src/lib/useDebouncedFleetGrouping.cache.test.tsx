/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GroupPresentation } from "./appViewModel";
import {
  buildFleetGroupingArtifactSourceSignature,
  isFleetGroupingArtifactUsable,
  type FleetGroupingCacheArtifact
} from "./fleetGroupingCache";
import type { PilotCard } from "./pilotDomain";
import { useDebouncedFleetGrouping, type DebouncedFleetGroupingDeps } from "./useDebouncedFleetGrouping";

function pilot(overrides: Partial<PilotCard>): PilotCard {
  return {
    parsedEntry: {
      pilotName: "Pilot",
      sourceLine: "Pilot",
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

function presentationMap(entries: Array<[number, GroupPresentation]>): Map<number, GroupPresentation> {
  return new Map(entries);
}

function killmailRows(anchorId: number, count: number): PilotCard["inferenceKills"] {
  return Array.from({ length: count }, (_, index) => ({
    killmail_id: anchorId * 10_000 + index + 1,
    killmail_time: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    victim: {},
    attackers: [{ character_id: anchorId }]
  }));
}

function artifact(overrides: Partial<FleetGroupingCacheArtifact> = {}): FleetGroupingCacheArtifact {
  return {
    version: 1,
    selectedPilotIds: [1001, 1002],
    sourceSignature: "fleet-grouping-artifact-src-v2|selected:1001,1002",
    orderedPilotIds: [1001, 1002],
    presentationEntries: [],
    savedAt: Date.now(),
    ...overrides
  };
}

describe("useDebouncedFleetGrouping cache artifact", () => {
  it("keeps selected ordering sourced from live sort even when cache artifact stores grouped order", async () => {
    const alpha = pilot({ characterId: 1001, characterName: "Alpha" });
    const bravo = pilot({ characterId: 1002, characterName: "Bravo" });
    const pilotCards = [alpha, bravo];
    const sortPilotCardsForFleetView = vi.fn((cards: PilotCard[]) => cards.slice());
    const deriveGroupPresentationByPilotId = vi.fn(() => presentationMap([]));
    const buildFleetGroupingArtifactSourceSignature = vi.fn(() => "fleet-grouping-artifact-src-v2|selected:1001,1002");
    const loadFleetGroupingArtifact = vi.fn(async () => ({
      artifact: artifact({
        orderedPilotIds: [1002, 1001],
        presentationEntries: [
          [
            1002,
            {
              groupId: "fleet-group-v1-b",
              groupColorToken: "fleet-group-color-1",
              isGreyedSuggestion: false,
              isUngrouped: false
            }
          ],
          [
            1001,
            {
              groupId: "fleet-group-v1-b",
              groupColorToken: "fleet-group-color-1",
              isGreyedSuggestion: false,
              isUngrouped: false
            }
          ]
        ]
      }),
      stale: false
    }));
    const isFleetGroupingArtifactUsableSpy = vi.fn(
      (_artifact: FleetGroupingCacheArtifact | null, _params: { selectedPilotIds: number[]; sourceSignature: string }) => true
    );
    const isFleetGroupingArtifactUsable: DebouncedFleetGroupingDeps["isFleetGroupingArtifactUsable"] = (
      artifact,
      params
    ): artifact is FleetGroupingCacheArtifact => isFleetGroupingArtifactUsableSpy(artifact, params);
    const saveFleetGroupingArtifact = vi.fn(async () => undefined);
    const deps: Partial<DebouncedFleetGroupingDeps> = {
      sortPilotCardsForFleetView,
      deriveGroupPresentationByPilotId,
      buildFleetGroupingArtifactSourceSignature,
      loadFleetGroupingArtifact,
      isFleetGroupingArtifactUsable,
      saveFleetGroupingArtifact
    };

    const { result } = renderHook(() => useDebouncedFleetGrouping(pilotCards, { deps, debounceMs: 0 }));
    expect(result.current.sortedPilotCards.map((row) => row.characterName)).toEqual(["Alpha", "Bravo"]);

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.sortedPilotCards.map((row) => row.characterName)).toEqual(["Alpha", "Bravo"]);
    });
  });

  it("falls back to regroup recompute when cache is stale/mismatched", async () => {
    const alpha = pilot({ characterId: 2001, characterName: "Alpha" });
    const bravo = pilot({ characterId: 2002, characterName: "Bravo" });
    const pilotCards = [alpha, bravo];
    const sortPilotCardsForFleetView = vi.fn((cards: PilotCard[]) => cards.slice().reverse());
    const deriveGroupPresentationByPilotId = vi.fn(() => presentationMap([]));
    const buildFleetGroupingArtifactSourceSignature = vi.fn(() => "fleet-grouping-artifact-src-v2|selected:2001,2002");
    const loadFleetGroupingArtifact = vi.fn(async () => ({
      artifact: artifact({
        selectedPilotIds: [2001, 2002],
        sourceSignature: "fleet-grouping-artifact-src-v2|selected:2001,2002|old",
        orderedPilotIds: [2001, 2002]
      }),
      stale: true
    }));
    const isFleetGroupingArtifactUsableSpy = vi.fn(
      (_artifact: FleetGroupingCacheArtifact | null, _params: { selectedPilotIds: number[]; sourceSignature: string }) => false
    );
    const isFleetGroupingArtifactUsable: DebouncedFleetGroupingDeps["isFleetGroupingArtifactUsable"] = (
      artifact,
      params
    ): artifact is FleetGroupingCacheArtifact => isFleetGroupingArtifactUsableSpy(artifact, params);
    const saveFleetGroupingArtifact = vi.fn(async () => undefined);
    const deps: Partial<DebouncedFleetGroupingDeps> = {
      sortPilotCardsForFleetView,
      deriveGroupPresentationByPilotId,
      buildFleetGroupingArtifactSourceSignature,
      loadFleetGroupingArtifact,
      isFleetGroupingArtifactUsable,
      saveFleetGroupingArtifact
    };

    const { result } = renderHook(() => useDebouncedFleetGrouping(pilotCards, { deps, debounceMs: 0 }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.sortedPilotCards.map((row) => row.characterName)).toEqual(["Bravo", "Alpha"]);
    expect(isFleetGroupingArtifactUsableSpy).toHaveBeenCalled();
    expect(saveFleetGroupingArtifact).toHaveBeenCalled();
  });

  it("keeps cache artifact usable for deep-history-only updates outside the v2 kill window without overriding live selected order", async () => {
    const alpha = pilot({ characterId: 3001, characterName: "Alpha", inferenceKills: killmailRows(3001, 130) });
    const bravo = pilot({ characterId: 3002, characterName: "Bravo" });
    const initialCards = [alpha, bravo];
    const deepUpdatedKills = alpha.inferenceKills.slice();
    deepUpdatedKills[120] = {
      ...deepUpdatedKills[120],
      killmail_id: 9_001_001
    };
    const updatedCards = [
      pilot({
        characterId: 3001,
        characterName: "Alpha",
        inferenceKills: deepUpdatedKills
      }),
      bravo
    ];

    const sortPilotCardsForFleetView = vi.fn((cards: PilotCard[]) => cards.slice());
    const deriveGroupPresentationByPilotId = vi.fn(() => presentationMap([]));
    const loadFleetGroupingArtifact = vi.fn(async () => ({
      artifact: artifact({
        selectedPilotIds: [3001, 3002],
        sourceSignature: buildFleetGroupingArtifactSourceSignature(initialCards),
        orderedPilotIds: [3002, 3001]
      }),
      stale: false
    }));
    const saveFleetGroupingArtifact = vi.fn(async () => undefined);
    const deps: Partial<DebouncedFleetGroupingDeps> = {
      sortPilotCardsForFleetView,
      deriveGroupPresentationByPilotId,
      buildFleetGroupingArtifactSourceSignature,
      loadFleetGroupingArtifact,
      isFleetGroupingArtifactUsable,
      saveFleetGroupingArtifact
    };

    const { result, rerender } = renderHook(
      ({ cards }) => useDebouncedFleetGrouping(cards, { deps, debounceMs: 0 }),
      { initialProps: { cards: initialCards } }
    );

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.sortedPilotCards.map((row) => row.characterName)).toEqual(["Alpha", "Bravo"]);
    });

    await act(async () => {
      rerender({ cards: updatedCards });
      await Promise.resolve();
    });

    expect(loadFleetGroupingArtifact).toHaveBeenCalledTimes(1);
    expect(result.current.sortedPilotCards.map((row) => row.characterName)).toEqual(["Alpha", "Bravo"]);
  });
});
