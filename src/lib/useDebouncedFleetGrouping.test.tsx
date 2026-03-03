/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function parsedEntry(name: string): PilotCard["parsedEntry"] {
  return {
    pilotName: name,
    sourceLine: name,
    parseConfidence: 1,
    shipSource: "inferred"
  };
}

describe("useDebouncedFleetGrouping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses burst updates into one regroup recompute inside the 1s window", () => {
    const sortPilotCardsForFleetView = vi.fn((cards: PilotCard[]) => cards.slice());
    const deriveGroupPresentationByPilotId = vi.fn(() => new Map());
    const deps: Partial<DebouncedFleetGroupingDeps> = {
      sortPilotCardsForFleetView,
      deriveGroupPresentationByPilotId
    };

    const alpha = [pilot({ characterId: 1001, characterName: "Alpha", parsedEntry: parsedEntry("Alpha") })];
    const bravo = [pilot({ characterId: 1002, characterName: "Bravo", parsedEntry: parsedEntry("Bravo") })];
    const charlie = [pilot({ characterId: 1003, characterName: "Charlie", parsedEntry: parsedEntry("Charlie") })];

    const { rerender } = renderHook(
      ({ cards }) => useDebouncedFleetGrouping(cards, { deps }),
      { initialProps: { cards: alpha } }
    );

    expect(sortPilotCardsForFleetView).toHaveBeenCalledTimes(1);
    expect(deriveGroupPresentationByPilotId).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ cards: bravo });
      rerender({ cards: charlie });
    });

    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(sortPilotCardsForFleetView).toHaveBeenCalledTimes(1);
    expect(deriveGroupPresentationByPilotId).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(sortPilotCardsForFleetView).toHaveBeenCalledTimes(2);
    expect(deriveGroupPresentationByPilotId).toHaveBeenCalledTimes(2);
  });

  it("recomputes from the freshest pilot-card state when debounce flushes", () => {
    const sortPilotCardsForFleetView = vi.fn((cards: PilotCard[]) => cards.slice());
    const deriveGroupPresentationByPilotId = vi.fn(() => new Map());
    const deps: Partial<DebouncedFleetGroupingDeps> = {
      sortPilotCardsForFleetView,
      deriveGroupPresentationByPilotId
    };

    const alpha = [pilot({ characterId: 2001, characterName: "Alpha", parsedEntry: parsedEntry("Alpha") })];
    const bravo = [pilot({ characterId: 2002, characterName: "Bravo", parsedEntry: parsedEntry("Bravo") })];
    const charlie = [pilot({ characterId: 2003, characterName: "Charlie", parsedEntry: parsedEntry("Charlie") })];

    const { rerender, result } = renderHook(
      ({ cards }) => useDebouncedFleetGrouping(cards, { deps }),
      { initialProps: { cards: alpha } }
    );

    act(() => {
      rerender({ cards: bravo });
      rerender({ cards: charlie });
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const latestSortInput = sortPilotCardsForFleetView.mock.calls.at(-1)?.[0];
    expect(latestSortInput).toBe(charlie);
    expect(result.current.sortedPilotCards[0]?.characterName).toBe("Charlie");
  });
});
