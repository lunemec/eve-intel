import { useEffect, useMemo, useState } from "react";
import {
  deriveGroupPresentationByPilotId,
  sortPilotCardsByDanger,
  sortPilotCardsForFleetView,
  type GroupPresentation
} from "./appViewModel";
import {
  buildFleetGroupingArtifactSourceSignature,
  isFleetGroupingArtifactUsable,
  loadFleetGroupingArtifact,
  materializeGroupPresentationByPilotId,
  saveFleetGroupingArtifact
} from "./fleetGroupingCache";
import type { PilotCard } from "./pilotDomain";
import { useLatestRef } from "./useLatestRef";

export const FLEET_GROUPING_DEBOUNCE_MS = 1_000;

export type DebouncedFleetGroupingDeps = {
  sortPilotCardsForFleetView: typeof sortPilotCardsForFleetView;
  deriveGroupPresentationByPilotId: typeof deriveGroupPresentationByPilotId;
  buildFleetGroupingArtifactSourceSignature: typeof buildFleetGroupingArtifactSourceSignature;
  loadFleetGroupingArtifact: typeof loadFleetGroupingArtifact;
  isFleetGroupingArtifactUsable: typeof isFleetGroupingArtifactUsable;
  saveFleetGroupingArtifact: typeof saveFleetGroupingArtifact;
};

const DEFAULT_DEPS: DebouncedFleetGroupingDeps = {
  sortPilotCardsForFleetView,
  deriveGroupPresentationByPilotId,
  buildFleetGroupingArtifactSourceSignature,
  loadFleetGroupingArtifact,
  isFleetGroupingArtifactUsable,
  saveFleetGroupingArtifact
};

export function useDebouncedFleetGrouping(
  pilotCards: PilotCard[],
  options: {
    debounceMs?: number;
    deps?: Partial<DebouncedFleetGroupingDeps>;
  } = {}
): {
  sortedPilotCards: PilotCard[];
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>;
} {
  const debounceMs = normalizeDebounceMs(options.debounceMs);
  const deps = useMemo(
    () => ({ ...DEFAULT_DEPS, ...(options.deps ?? {}) }),
    [options.deps]
  );
  const latestPilotCardsRef = useLatestRef(pilotCards);
  const [debouncedPilotCards, setDebouncedPilotCards] = useState<PilotCard[]>(pilotCards);
  const [cachedOrderedPilotIds, setCachedOrderedPilotIds] = useState<number[]>([]);
  const [cachedPresentationByPilotId, setCachedPresentationByPilotId] = useState<ReadonlyMap<number, GroupPresentation>>(new Map());
  const selectedPilotIds = useMemo(() => collectSelectedPilotIds(pilotCards), [pilotCards]);
  const selectedPilotIdsKey = useMemo(() => selectedPilotIds.join(","), [selectedPilotIds]);
  const sourceSignature = useMemo(
    () => deps.buildFleetGroupingArtifactSourceSignature(pilotCards),
    [deps, pilotCards]
  );

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

  useEffect(() => {
    let cancelled = false;
    const selectedPilotIdsForCache = selectedPilotIdsKey.length > 0
      ? selectedPilotIdsKey.split(",").map((id) => Number.parseInt(id, 10))
      : [];

    if (selectedPilotIdsForCache.length === 0) {
      setCachedOrderedPilotIds((previous) => (previous.length === 0 ? previous : []));
      setCachedPresentationByPilotId((previous) => (previous.size === 0 ? previous : new Map()));
      return () => {
        cancelled = true;
      };
    }

    void deps
      .loadFleetGroupingArtifact({ selectedPilotIds: selectedPilotIdsForCache })
      .then((cached) => {
        if (cancelled) {
          return;
        }
        if (
          !deps.isFleetGroupingArtifactUsable(cached.artifact, {
            selectedPilotIds: selectedPilotIdsForCache,
            sourceSignature
          })
        ) {
          setCachedOrderedPilotIds((previous) => (previous.length === 0 ? previous : []));
          setCachedPresentationByPilotId((previous) => (previous.size === 0 ? previous : new Map()));
          return;
        }
        const nextOrderedPilotIds = cached.artifact.orderedPilotIds;
        const nextPresentationByPilotId = materializeGroupPresentationByPilotId(cached.artifact.presentationEntries);
        setCachedOrderedPilotIds((previous) =>
          arrayEquals(previous, nextOrderedPilotIds) ? previous : nextOrderedPilotIds
        );
        setCachedPresentationByPilotId((previous) =>
          presentationMapEquals(previous, nextPresentationByPilotId)
            ? previous
            : nextPresentationByPilotId
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setCachedOrderedPilotIds((previous) => (previous.length === 0 ? previous : []));
        setCachedPresentationByPilotId((previous) => (previous.size === 0 ? previous : new Map()));
      });

    return () => {
      cancelled = true;
    };
  }, [deps, selectedPilotIdsKey, sourceSignature]);

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
  const effectiveOrderedPilotIds = useMemo(
    () => (cachedOrderedPilotIds.length > 0 ? cachedOrderedPilotIds : debouncedOrderedPilotIds),
    [cachedOrderedPilotIds, debouncedOrderedPilotIds]
  );
  const effectivePresentationByPilotId = useMemo(
    () =>
      cachedPresentationByPilotId.size > 0
        ? cachedPresentationByPilotId
        : debouncedPresentationByPilotId,
    [cachedPresentationByPilotId, debouncedPresentationByPilotId]
  );
  const debouncedSelectedPilotIds = useMemo(
    () => collectSelectedPilotIds(debouncedPilotCards),
    [debouncedPilotCards]
  );
  const debouncedSelectedPilotIdsKey = useMemo(
    () => debouncedSelectedPilotIds.join(","),
    [debouncedSelectedPilotIds]
  );
  const debouncedSourceSignature = useMemo(
    () => deps.buildFleetGroupingArtifactSourceSignature(debouncedPilotCards),
    [debouncedPilotCards, deps]
  );

  const sortedPilotCards = useMemo(
    () =>
      applyDebouncedOrdering({
        fallbackOrder,
        currentPilotCards: pilotCards,
        orderedPilotIds: effectiveOrderedPilotIds
      }),
    [effectiveOrderedPilotIds, fallbackOrder, pilotCards]
  );
  const currentPilotIdSet = useMemo(() => collectValidPilotIds(pilotCards), [pilotCards]);
  const groupPresentationByPilotId = useMemo(
    () => filterPresentationToCurrentPilots(effectivePresentationByPilotId, currentPilotIdSet),
    [currentPilotIdSet, effectivePresentationByPilotId]
  );

  useEffect(() => {
    if (debouncedSelectedPilotIdsKey.length === 0) {
      return;
    }
    const selectedPilotIdsForCache = debouncedSelectedPilotIdsKey
      .split(",")
      .map((id) => Number.parseInt(id, 10));
    void deps.saveFleetGroupingArtifact({
      selectedPilotIds: selectedPilotIdsForCache,
      sourceSignature: debouncedSourceSignature,
      orderedPilotIds: debouncedOrderedPilotIds,
      groupPresentationByPilotId: debouncedPresentationByPilotId
    });
  }, [
    debouncedOrderedPilotIds,
    debouncedPresentationByPilotId,
    debouncedSelectedPilotIdsKey,
    debouncedSourceSignature,
    deps
  ]);

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

function collectSelectedPilotIds(pilotCards: PilotCard[]): number[] {
  const ids = collectValidPilotIds(pilotCards);
  return [...ids].sort((a, b) => a - b);
}

function arrayEquals(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function presentationMapEquals(
  left: ReadonlyMap<number, GroupPresentation>,
  right: ReadonlyMap<number, GroupPresentation>
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [pilotId, leftPresentation] of left) {
    const rightPresentation = right.get(pilotId);
    if (!rightPresentation) {
      return false;
    }
    if (
      leftPresentation.groupId !== rightPresentation.groupId ||
      leftPresentation.groupColorToken !== rightPresentation.groupColorToken ||
      leftPresentation.isGreyedSuggestion !== rightPresentation.isGreyedSuggestion ||
      leftPresentation.isUngrouped !== rightPresentation.isUngrouped
    ) {
      return false;
    }
  }
  return true;
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
