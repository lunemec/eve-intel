/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZkillKillmail } from "./api/zkill";
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

function killmailSeries(
  anchorId: number,
  totalKills: number,
  candidateSharedKills: Array<[candidateId: number, sharedKillCount: number]>
): ZkillKillmail[] {
  return Array.from({ length: totalKills }, (_, index) => ({
    killmail_id: anchorId * 10_000 + index + 1,
    killmail_time: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    victim: {},
    attackers: [
      { character_id: anchorId },
      ...candidateSharedKills
        .filter(([, sharedKillCount]) => index < sharedKillCount)
        .map(([candidateId]) => ({ character_id: candidateId }))
    ]
  }));
}

function findFleetGroupingDeltaPayload(
  calls: unknown[][],
  predicate: (payload: Record<string, unknown>) => boolean
): Record<string, unknown> | undefined {
  for (const call of calls) {
    if (call[0] !== "Fleet grouping recompute delta" || typeof call[1] !== "object" || call[1] === null) {
      continue;
    }
    const payload = call[1] as Record<string, unknown>;
    if (predicate(payload)) {
      return payload;
    }
  }
  return undefined;
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

  it("logs when visible suggestions are removed after dropping below visibility thresholds", async () => {
    const anchorId = 9101;
    const candidateId = 9102;
    const logDebug = vi.fn();
    const initialCards = [
      pilot({
        characterId: anchorId,
        characterName: "Anchor",
        parsedEntry: parsedEntry("Anchor"),
        inferenceKills: killmailSeries(anchorId, 10, [[candidateId, 10]])
      })
    ];
    const updatedCards = [
      pilot({
        characterId: anchorId,
        characterName: "Anchor",
        parsedEntry: parsedEntry("Anchor"),
        inferenceKills: killmailSeries(anchorId, 20, [[candidateId, 9]])
      })
    ];

    const { rerender } = renderHook(
      ({ cards }) => useDebouncedFleetGrouping(cards, { debounceMs: 0, logDebug }),
      { initialProps: { cards: initialCards } }
    );
    await act(async () => {
      await Promise.resolve();
    });
    logDebug.mockClear();

    await act(async () => {
      rerender({ cards: updatedCards });
      await Promise.resolve();
    });

    const payload = findFleetGroupingDeltaPayload(logDebug.mock.calls, (delta) => {
      const visibleSuggestions = delta.visibleSuggestions as { removed?: Array<{ characterId: number; reason: string }> } | undefined;
      if (!visibleSuggestions || !Array.isArray(visibleSuggestions.removed)) {
        return false;
      }
      return visibleSuggestions.removed.some(
        (entry) => entry.characterId === candidateId && entry.reason === "below-visibility-threshold"
      );
    });
    expect(payload).toBeTruthy();
    const removedEntry = (
      (payload?.visibleSuggestions as { removed?: Array<Record<string, unknown>> } | undefined)?.removed ?? []
    ).find((entry) => entry.characterId === candidateId);
    expect(removedEntry).toMatchObject({
      strongestWindowKillCount: 10,
      visibilityRatioThreshold: 0.8,
      visibilityWindowMinKills: 10,
      visibilityWindowMaxKills: 100
    });
  });

  it("logs adaptive-cap trimming when a still-eligible suggestion is displaced by stronger candidates", async () => {
    const anchorId = 9201;
    const candidateA = 9202;
    const candidateB = 9203;
    const candidateC = 9204;
    const candidateD = 9205;
    const logDebug = vi.fn();
    const initialCards = [
      pilot({
        characterId: anchorId,
        characterName: "Anchor",
        parsedEntry: parsedEntry("Anchor"),
        inferenceKills: killmailSeries(anchorId, 20, [
          [candidateA, 20],
          [candidateB, 19],
          [candidateC, 18],
          [candidateD, 17]
        ])
      })
    ];
    const updatedCards = [
      pilot({
        characterId: anchorId,
        characterName: "Anchor",
        parsedEntry: parsedEntry("Anchor"),
        inferenceKills: killmailSeries(anchorId, 20, [
          [candidateA, 20],
          [candidateB, 19],
          [candidateC, 18],
          [candidateD, 19]
        ])
      })
    ];

    const { rerender } = renderHook(
      ({ cards }) => useDebouncedFleetGrouping(cards, { debounceMs: 0, logDebug }),
      { initialProps: { cards: initialCards } }
    );
    await act(async () => {
      await Promise.resolve();
    });
    logDebug.mockClear();

    await act(async () => {
      rerender({ cards: updatedCards });
      await Promise.resolve();
    });

    const payload = findFleetGroupingDeltaPayload(logDebug.mock.calls, (delta) => {
      const visibleSuggestions = delta.visibleSuggestions as { removed?: Array<{ characterId: number; reason: string }> } | undefined;
      if (!visibleSuggestions || !Array.isArray(visibleSuggestions.removed)) {
        return false;
      }
      return visibleSuggestions.removed.some(
        (entry) => entry.characterId === candidateC && entry.reason === "trimmed-by-adaptive-cap"
      );
    });
    expect(payload).toBeTruthy();
    const removedEntry = (
      (payload?.visibleSuggestions as { removed?: Array<Record<string, unknown>> } | undefined)?.removed ?? []
    ).find((entry) => entry.characterId === candidateC);
    expect(removedEntry).toMatchObject({
      strongestWindowKillCount: 20,
      visibilityRatioThreshold: 0.8,
      visibilityWindowMinKills: 10,
      visibilityWindowMaxKills: 100
    });
  });
});
