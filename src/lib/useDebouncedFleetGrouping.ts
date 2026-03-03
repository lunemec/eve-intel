import { useEffect, useMemo, useState } from "react";
import {
  deriveGroupPresentationByPilotId,
  sortPilotCardsByDanger,
  sortPilotCardsForFleetView,
  type GroupPresentation
} from "./appViewModel";
import type { PilotCard } from "./pilotDomain";
import { useLatestRef } from "./useLatestRef";

export const FLEET_GROUPING_DEBOUNCE_MS = 1_000;

export type DebouncedFleetGroupingDeps = {
  sortPilotCardsForFleetView: typeof sortPilotCardsForFleetView;
  deriveGroupPresentationByPilotId: typeof deriveGroupPresentationByPilotId;
};

const DEFAULT_DEPS: DebouncedFleetGroupingDeps = {
  sortPilotCardsForFleetView,
  deriveGroupPresentationByPilotId
};

export function useDebouncedFleetGrouping(
  pilotCards: PilotCard[],
  options: {
    debounceMs?: number;
    deps?: DebouncedFleetGroupingDeps;
  } = {}
): {
  sortedPilotCards: PilotCard[];
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>;
} {
  const debounceMs = normalizeDebounceMs(options.debounceMs);
  const deps = options.deps ?? DEFAULT_DEPS;
  const latestPilotCardsRef = useLatestRef(pilotCards);
  const [debouncedPilotCards, setDebouncedPilotCards] = useState<PilotCard[]>(pilotCards);

  useEffect(() => {
    if (debounceMs === 0) {
      setDebouncedPilotCards(latestPilotCardsRef.current);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      setDebouncedPilotCards(latestPilotCardsRef.current);
    }, debounceMs);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [debounceMs, latestPilotCardsRef, pilotCards]);

  const fallbackOrder = useMemo(() => sortPilotCardsByDanger(pilotCards), [pilotCards]);
  const debouncedSortedPilotCards = useMemo(
    () => deps.sortPilotCardsForFleetView(debouncedPilotCards),
    [debouncedPilotCards, deps]
  );
  const debouncedPresentationByPilotId = useMemo(
    () => deps.deriveGroupPresentationByPilotId(debouncedSortedPilotCards),
    [debouncedSortedPilotCards, deps]
  );
  const debouncedOrderedPilotIds = useMemo(
    () => collectOrderedPilotIds(debouncedSortedPilotCards),
    [debouncedSortedPilotCards]
  );

  const sortedPilotCards = useMemo(
    () => applyDebouncedOrdering({ fallbackOrder, currentPilotCards: pilotCards, orderedPilotIds: debouncedOrderedPilotIds }),
    [debouncedOrderedPilotIds, fallbackOrder, pilotCards]
  );
  const currentPilotIdSet = useMemo(() => collectValidPilotIds(pilotCards), [pilotCards]);
  const groupPresentationByPilotId = useMemo(
    () => filterPresentationToCurrentPilots(debouncedPresentationByPilotId, currentPilotIdSet),
    [currentPilotIdSet, debouncedPresentationByPilotId]
  );

  return {
    sortedPilotCards,
    groupPresentationByPilotId
  };
}

function normalizeDebounceMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return FLEET_GROUPING_DEBOUNCE_MS;
  }
  if (value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function collectOrderedPilotIds(pilotCards: PilotCard[]): number[] {
  const ids: number[] = [];
  const included = new Set<number>();
  for (const pilot of pilotCards) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId === null || included.has(pilotId)) {
      continue;
    }
    ids.push(pilotId);
    included.add(pilotId);
  }
  return ids;
}

function applyDebouncedOrdering(params: {
  fallbackOrder: PilotCard[];
  currentPilotCards: PilotCard[];
  orderedPilotIds: number[];
}): PilotCard[] {
  const { fallbackOrder, currentPilotCards, orderedPilotIds } = params;
  if (orderedPilotIds.length === 0) {
    return fallbackOrder;
  }
  const byPilotId = new Map<number, PilotCard>();
  for (const pilot of currentPilotCards) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId === null || byPilotId.has(pilotId)) {
      continue;
    }
    byPilotId.set(pilotId, pilot);
  }
  if (byPilotId.size === 0) {
    return fallbackOrder;
  }
  const ordered: PilotCard[] = [];
  const included = new Set<number>();
  for (const pilotId of orderedPilotIds) {
    const pilot = byPilotId.get(pilotId);
    if (!pilot || included.has(pilotId)) {
      continue;
    }
    ordered.push(pilot);
    included.add(pilotId);
  }
  for (const pilot of fallbackOrder) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId !== null && included.has(pilotId)) {
      continue;
    }
    ordered.push(pilot);
  }
  return ordered;
}

function collectValidPilotIds(pilotCards: PilotCard[]): Set<number> {
  const ids = new Set<number>();
  for (const pilot of pilotCards) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId !== null) {
      ids.add(pilotId);
    }
  }
  return ids;
}

function filterPresentationToCurrentPilots(
  presentationByPilotId: ReadonlyMap<number, GroupPresentation>,
  currentPilotIdSet: ReadonlySet<number>
): ReadonlyMap<number, GroupPresentation> {
  if (presentationByPilotId.size === 0 || currentPilotIdSet.size === 0) {
    return new Map();
  }
  const filtered = new Map<number, GroupPresentation>();
  for (const [pilotId, presentation] of presentationByPilotId) {
    if (currentPilotIdSet.has(pilotId)) {
      filtered.set(pilotId, presentation);
    }
  }
  return filtered;
}

function toValidPilotId(value?: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}
