import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveGroupPresentationByPilotId,
  sortPilotCardsByDanger,
  sortPilotCardsForFleetView,
  type GroupPresentation
} from "./appViewModel";
import {
  CO_FLY_RATIO_THRESHOLD,
  CO_FLY_RECENT_KILL_WINDOW_MAX,
  CO_FLY_RECENT_KILL_WINDOW_MIN,
  computeFleetGrouping,
  type SuggestedPilot
} from "./fleetGrouping";
import {
  buildFleetGroupingArtifactSourceSignature,
  type FleetGroupingCacheArtifact,
  isFleetGroupingArtifactUsable,
  loadFleetGroupingArtifact,
  materializeGroupPresentationByPilotId,
  saveFleetGroupingArtifact
} from "./fleetGroupingCache";
import type { PilotCard } from "./pilotDomain";
import { useLatestRef } from "./useLatestRef";

export const FLEET_GROUPING_DEBOUNCE_MS = 1_000;
const FLEET_GROUPING_GUARD_REFRESH_MS = 30_000;

type FleetGroupingRecomputeScheduleReason =
  | "selected-changed"
  | "significant-signature-changed"
  | "guard-refresh";

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
    logDebug?: (message: string, data?: unknown) => void;
  } = {}
): {
  sortedPilotCards: PilotCard[];
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>;
  fleetSummaryGroupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>;
} {
  const logDebug = options.logDebug;
  const debounceMs = normalizeDebounceMs(options.debounceMs);
  const deps = useMemo(
    () => ({ ...DEFAULT_DEPS, ...(options.deps ?? {}) }),
    [options.deps]
  );
  const latestPilotCardsRef = useLatestRef(pilotCards);
  const [debouncedPilotCards, setDebouncedPilotCards] = useState<PilotCard[]>(pilotCards);
  const [cachedOrderedPilotIds, setCachedOrderedPilotIds] = useState<number[]>([]);
  const [cachedPresentationByPilotId, setCachedPresentationByPilotId] = useState<ReadonlyMap<number, GroupPresentation>>(new Map());
  const previousGroupingDiagnosticRef = useRef<FleetGroupingDiagnosticSnapshot | null>(null);
  const selectedPilotIds = useMemo(() => collectSelectedPilotIds(pilotCards), [pilotCards]);
  const selectedPilotIdsKey = useMemo(() => selectedPilotIds.join(","), [selectedPilotIds]);
  const sourceSignature = useMemo(
    () => deps.buildFleetGroupingArtifactSourceSignature(pilotCards),
    [deps, pilotCards]
  );
  const previousSelectedPilotIdsKeyRef = useRef<string | null>(null);
  const previousSignificantSourceSignatureRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const guardIntervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const selectedFetchActive = useMemo(() => hasActiveSelectedPilotFetch(pilotCards), [pilotCards]);

  const scheduleFleetGroupingRecompute = useCallback(
    (reason: FleetGroupingRecomputeScheduleReason, options: { forceRefresh?: boolean } = {}) => {
      const forceRefresh = options.forceRefresh === true;
      const selectedPilots = selectedPilotIds.length;
      if (selectedPilots === 0) {
        return;
      }

      if (logDebug) {
        logDebug("Fleet grouping recompute scheduled", {
          reason,
          selectedPilots,
          debounceMs,
          sourceSignature: summarizeSourceSignature(sourceSignature)
        });
      }

      const applyUpdate = () => {
        const nextCards = latestPilotCardsRef.current;
        setDebouncedPilotCards(forceRefresh ? nextCards.slice() : nextCards);
      };

      if (debounceTimerRef.current !== null) {
        globalThis.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (debounceMs === 0) {
        applyUpdate();
        return;
      }

      debounceTimerRef.current = globalThis.setTimeout(() => {
        debounceTimerRef.current = null;
        applyUpdate();
      }, debounceMs);
    },
    [debounceMs, latestPilotCardsRef, logDebug, selectedPilotIds.length, sourceSignature]
  );

  useEffect(() => {
    const previousSelectedPilotIdsKey = previousSelectedPilotIdsKeyRef.current;
    const previousSignificantSourceSignature = previousSignificantSourceSignatureRef.current;
    const selectedChanged = previousSelectedPilotIdsKey !== selectedPilotIdsKey;
    const significantSignatureChanged = previousSignificantSourceSignature !== sourceSignature;

    previousSelectedPilotIdsKeyRef.current = selectedPilotIdsKey;
    previousSignificantSourceSignatureRef.current = sourceSignature;

    if (selectedPilotIds.length === 0) {
      if (debounceTimerRef.current !== null) {
        globalThis.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setDebouncedPilotCards(latestPilotCardsRef.current);
      return;
    }

    if (selectedChanged) {
      scheduleFleetGroupingRecompute("selected-changed");
      return;
    }

    if (significantSignatureChanged) {
      scheduleFleetGroupingRecompute("significant-signature-changed");
      return;
    }

    if (logDebug) {
      logDebug("Fleet grouping recompute skipped", {
        reason: "signature-unchanged",
        selectedPilots: selectedPilotIds.length,
        sourceSignature: summarizeSourceSignature(sourceSignature)
      });
    }
  }, [
    latestPilotCardsRef,
    logDebug,
    scheduleFleetGroupingRecompute,
    pilotCards,
    selectedPilotIds.length,
    selectedPilotIdsKey,
    sourceSignature
  ]);

  useEffect(() => {
    if (!selectedFetchActive) {
      if (guardIntervalRef.current !== null) {
        globalThis.clearInterval(guardIntervalRef.current);
        guardIntervalRef.current = null;
      }
      return;
    }

    if (guardIntervalRef.current !== null) {
      return;
    }

    guardIntervalRef.current = globalThis.setInterval(() => {
      scheduleFleetGroupingRecompute("guard-refresh", { forceRefresh: true });
    }, FLEET_GROUPING_GUARD_REFRESH_MS);

    return () => {
      if (guardIntervalRef.current !== null) {
        globalThis.clearInterval(guardIntervalRef.current);
        guardIntervalRef.current = null;
      }
    };
  }, [scheduleFleetGroupingRecompute, selectedFetchActive]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        globalThis.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (guardIntervalRef.current !== null) {
        globalThis.clearInterval(guardIntervalRef.current);
        guardIntervalRef.current = null;
      }
    };
  }, []);

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
        const cacheOutcome = describeArtifactCacheOutcome({
          artifact: cached.artifact,
          selectedPilotIds: selectedPilotIdsForCache,
          sourceSignature
        });
        if (logDebug) {
          logDebug(
            cacheOutcome.usable ? "Fleet grouping artifact cache hit" : "Fleet grouping artifact cache miss",
            {
              selectedPilots: selectedPilotIdsForCache.length,
              stale: cached.stale,
              reason: cacheOutcome.reason,
              artifactSelectedPilots: cached.artifact?.selectedPilotIds.length ?? 0,
              artifactOrderedPilots: cached.artifact?.orderedPilotIds.length ?? 0,
              sourceSignature: summarizeSourceSignature(sourceSignature)
            }
          );
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
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (logDebug) {
          logDebug("Fleet grouping artifact cache load failed", {
            selectedPilots: selectedPilotIdsForCache.length,
            sourceSignature: summarizeSourceSignature(sourceSignature),
            error: error instanceof Error ? error.message : String(error)
          });
        }
        setCachedOrderedPilotIds((previous) => (previous.length === 0 ? previous : []));
        setCachedPresentationByPilotId((previous) => (previous.size === 0 ? previous : new Map()));
      });

    return () => {
      cancelled = true;
    };
  }, [deps, logDebug, selectedPilotIdsKey, sourceSignature]);

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
  const fleetSummaryGroupPresentationByPilotId = effectivePresentationByPilotId;

  useEffect(() => {
    if (!logDebug) {
      return;
    }

    const currentSnapshot = buildFleetGroupingDiagnosticSnapshot({
      pilotCards: debouncedPilotCards,
      sourceSignature: debouncedSourceSignature
    });
    const previousSnapshot = previousGroupingDiagnosticRef.current;
    if (!previousSnapshot) {
      previousGroupingDiagnosticRef.current = currentSnapshot;
      logDebug("Fleet grouping diagnostics baseline", {
        selectedPilots: currentSnapshot.selectedPilotIds.length,
        groups: currentSnapshot.groups.length,
        visibleSuggestions: currentSnapshot.visibleSuggestions.length,
        internalSuggestions: currentSnapshot.internalSuggestions.length,
        sourceSignature: summarizeSourceSignature(currentSnapshot.sourceSignature)
      });
      return;
    }

    const delta = buildFleetGroupingDiagnosticDelta(previousSnapshot, currentSnapshot);
    previousGroupingDiagnosticRef.current = currentSnapshot;
    if (!delta) {
      return;
    }
    logDebug("Fleet grouping recompute delta", delta);
  }, [debouncedPilotCards, debouncedSourceSignature, logDebug]);

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
    groupPresentationByPilotId,
    fleetSummaryGroupPresentationByPilotId
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

function hasActiveSelectedPilotFetch(pilotCards: PilotCard[]): boolean {
  const selectedPilotIds = collectSelectedPilotIds(pilotCards);
  if (selectedPilotIds.length === 0) {
    return false;
  }

  const pilotCardsById = new Map<number, PilotCard>();
  for (const pilot of pilotCards) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId === null || pilotCardsById.has(pilotId)) {
      continue;
    }
    pilotCardsById.set(pilotId, pilot);
  }

  for (const pilotId of selectedPilotIds) {
    const fetchPhase = pilotCardsById.get(pilotId)?.fetchPhase;
    if (!isTerminalFetchPhase(fetchPhase)) {
      return true;
    }
  }
  return false;
}

function isTerminalFetchPhase(fetchPhase: PilotCard["fetchPhase"] | undefined): boolean {
  return fetchPhase === "ready" || fetchPhase === "error";
}

function arrayEquals<T>(left: T[], right: T[]): boolean {
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
      leftPresentation.isUngrouped !== rightPresentation.isUngrouped ||
      leftPresentation.suggestionStrongestRatio !== rightPresentation.suggestionStrongestRatio ||
      leftPresentation.suggestionStrongestSharedKillCount !== rightPresentation.suggestionStrongestSharedKillCount ||
      leftPresentation.suggestionStrongestWindowKillCount !== rightPresentation.suggestionStrongestWindowKillCount ||
      leftPresentation.suggestionStrongestSourcePilotId !== rightPresentation.suggestionStrongestSourcePilotId ||
      leftPresentation.suggestionStrongestSourcePilotName !== rightPresentation.suggestionStrongestSourcePilotName
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

type ArtifactCacheOutcome = {
  usable: boolean;
  reason: "usable" | "missing-artifact" | "version-mismatch" | "selected-mismatch" | "source-signature-mismatch";
};

type PilotEvidenceSnapshot = {
  pilotId: number;
  inferenceKillCount: number;
  inferenceLossCount: number;
  killmailHead: number[];
  lossmailHead: number[];
};

type FleetGroupingDiagnosticSnapshot = {
  sourceSignature: string;
  selectedPilotIds: number[];
  selectedPilotIdSet: ReadonlySet<number>;
  selectedEvidence: PilotEvidenceSnapshot[];
  groups: Array<{
    groupId: string;
    memberPilotIds: number[];
    selectedPilotIds: number[];
    suggestedPilotIds: number[];
  }>;
  visibleSuggestions: SuggestedPilot[];
  visibleSuggestionById: ReadonlyMap<number, SuggestedPilot>;
  internalSuggestions: SuggestedPilot[];
  internalSuggestionById: ReadonlyMap<number, SuggestedPilot>;
};

function describeArtifactCacheOutcome(params: {
  artifact: FleetGroupingCacheArtifact | null;
  selectedPilotIds: number[];
  sourceSignature: string;
}): ArtifactCacheOutcome {
  if (!params.artifact) {
    return { usable: false, reason: "missing-artifact" };
  }
  if (params.artifact.version !== 1) {
    return { usable: false, reason: "version-mismatch" };
  }
  const expectedSelectedPilotIds = normalizePilotIdsForDiagnostics(params.selectedPilotIds);
  if (!arrayEquals(params.artifact.selectedPilotIds, expectedSelectedPilotIds)) {
    return { usable: false, reason: "selected-mismatch" };
  }
  if (params.artifact.sourceSignature !== params.sourceSignature) {
    return { usable: false, reason: "source-signature-mismatch" };
  }
  return { usable: true, reason: "usable" };
}

function buildFleetGroupingDiagnosticSnapshot(params: {
  pilotCards: PilotCard[];
  sourceSignature: string;
}): FleetGroupingDiagnosticSnapshot {
  const selectedPilotIds = collectSelectedPilotIds(params.pilotCards);
  const selectedPilotIdSet = new Set<number>(selectedPilotIds);
  const pilotCardsById = new Map<number, PilotCard>();
  const allKnownPilotNamesById = new Map<number, string>();
  for (const pilot of params.pilotCards) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId === null) {
      continue;
    }
    if (!pilotCardsById.has(pilotId)) {
      pilotCardsById.set(pilotId, pilot);
    }
    const resolvedName = (pilot.characterName ?? pilot.parsedEntry.pilotName).trim();
    if (resolvedName.length > 0) {
      allKnownPilotNamesById.set(pilotId, resolvedName);
    }
  }

  const selectedEvidence = selectedPilotIds.map((pilotId) => {
    const pilot = pilotCardsById.get(pilotId);
    return {
      pilotId,
      inferenceKillCount: pilot?.inferenceKills.length ?? 0,
      inferenceLossCount: pilot?.inferenceLosses.length ?? 0,
      killmailHead: collectKillmailHead(pilot?.inferenceKills ?? []),
      lossmailHead: collectKillmailHead(pilot?.inferenceLosses ?? [])
    };
  });

  if (selectedPilotIds.length === 0) {
    return {
      sourceSignature: params.sourceSignature,
      selectedPilotIds,
      selectedPilotIdSet,
      selectedEvidence,
      groups: [],
      visibleSuggestions: [],
      visibleSuggestionById: new Map(),
      internalSuggestions: [],
      internalSuggestionById: new Map()
    };
  }

  const grouping = computeFleetGrouping({
    selectedPilotIds,
    pilotCardsById,
    allKnownPilotNamesById,
    nowMs: 0
  });
  return {
    sourceSignature: params.sourceSignature,
    selectedPilotIds,
    selectedPilotIdSet,
    selectedEvidence,
    groups: grouping.groups.map((group) => ({
      groupId: group.groupId,
      memberPilotIds: group.memberPilotIds.slice(),
      selectedPilotIds: group.selectedPilotIds.slice(),
      suggestedPilotIds: group.suggestedPilotIds.slice()
    })),
    visibleSuggestions: grouping.suggestions,
    visibleSuggestionById: indexSuggestionsByCharacterId(grouping.suggestions),
    internalSuggestions: grouping.state.suggestions,
    internalSuggestionById: indexSuggestionsByCharacterId(grouping.state.suggestions)
  };
}

function buildFleetGroupingDiagnosticDelta(
  previousSnapshot: FleetGroupingDiagnosticSnapshot,
  currentSnapshot: FleetGroupingDiagnosticSnapshot
): Record<string, unknown> | null {
  const previousGroupIds = previousSnapshot.groups.map((group) => group.groupId);
  const currentGroupIds = currentSnapshot.groups.map((group) => group.groupId);
  const addedGroupIds = currentGroupIds.filter((groupId) => !previousGroupIds.includes(groupId));
  const removedGroupIds = previousGroupIds.filter((groupId) => !currentGroupIds.includes(groupId));
  const groupOrderChanged =
    previousGroupIds.length === currentGroupIds.length && !arrayEquals(previousGroupIds, currentGroupIds);

  const previousVisibleIds = previousSnapshot.visibleSuggestions.map((suggestion) => suggestion.characterId);
  const currentVisibleIds = currentSnapshot.visibleSuggestions.map((suggestion) => suggestion.characterId);
  const addedVisibleSuggestionIds = currentVisibleIds.filter((pilotId) => !previousVisibleIds.includes(pilotId));
  const removedVisibleSuggestionIds = previousVisibleIds.filter((pilotId) => !currentVisibleIds.includes(pilotId));

  const addedVisibleSuggestions = addedVisibleSuggestionIds.map((pilotId) => {
    const suggestion = currentSnapshot.visibleSuggestionById.get(pilotId);
    return formatSuggestionDebug(suggestion);
  });
  const removedVisibleSuggestions = removedVisibleSuggestionIds.map((pilotId) =>
    classifyRemovedVisibleSuggestion({
      characterId: pilotId,
      previousSnapshot,
      currentSnapshot
    })
  );

  const selectedPilotEvidenceChanges = buildSelectedEvidenceChanges(previousSnapshot, currentSnapshot);
  const sourceSignatureChanged = previousSnapshot.sourceSignature !== currentSnapshot.sourceSignature;
  const internalSuggestionCountChanged =
    previousSnapshot.internalSuggestions.length !== currentSnapshot.internalSuggestions.length;
  const visibleSuggestionOrderChanged =
    previousVisibleIds.length === currentVisibleIds.length && !arrayEquals(previousVisibleIds, currentVisibleIds);

  if (
    !sourceSignatureChanged &&
    addedGroupIds.length === 0 &&
    removedGroupIds.length === 0 &&
    !groupOrderChanged &&
    addedVisibleSuggestions.length === 0 &&
    removedVisibleSuggestions.length === 0 &&
    !internalSuggestionCountChanged &&
    !visibleSuggestionOrderChanged &&
    selectedPilotEvidenceChanges.length === 0
  ) {
    return null;
  }

  return {
    selectedPilots: currentSnapshot.selectedPilotIds.length,
    sourceSignature: {
      changed: sourceSignatureChanged,
      previous: summarizeSourceSignature(previousSnapshot.sourceSignature),
      current: summarizeSourceSignature(currentSnapshot.sourceSignature)
    },
    groups: {
      before: previousSnapshot.groups.length,
      after: currentSnapshot.groups.length,
      addedGroupIds: addedGroupIds.slice(0, 10),
      removedGroupIds: removedGroupIds.slice(0, 10),
      orderChanged: groupOrderChanged
    },
    visibleSuggestions: {
      before: previousSnapshot.visibleSuggestions.length,
      after: currentSnapshot.visibleSuggestions.length,
      added: addedVisibleSuggestions.slice(0, 12),
      removed: removedVisibleSuggestions.slice(0, 12),
      orderChanged: visibleSuggestionOrderChanged
    },
    internalSuggestionCount: {
      before: previousSnapshot.internalSuggestions.length,
      after: currentSnapshot.internalSuggestions.length
    },
    selectedPilotEvidenceChanges: selectedPilotEvidenceChanges.slice(0, 12)
  };
}

function buildSelectedEvidenceChanges(
  previousSnapshot: FleetGroupingDiagnosticSnapshot,
  currentSnapshot: FleetGroupingDiagnosticSnapshot
): Array<Record<string, unknown>> {
  const previousByPilotId = new Map(previousSnapshot.selectedEvidence.map((entry) => [entry.pilotId, entry]));
  const currentByPilotId = new Map(currentSnapshot.selectedEvidence.map((entry) => [entry.pilotId, entry]));
  const pilotIds = normalizePilotIdsForDiagnostics([
    ...previousSnapshot.selectedPilotIds,
    ...currentSnapshot.selectedPilotIds
  ]);
  const changes: Array<Record<string, unknown>> = [];

  for (const pilotId of pilotIds) {
    const previous = previousByPilotId.get(pilotId);
    const current = currentByPilotId.get(pilotId);
    if (!previous && current) {
      changes.push({
        pilotId,
        reason: "pilot-added",
        after: current
      });
      continue;
    }
    if (previous && !current) {
      changes.push({
        pilotId,
        reason: "pilot-removed",
        before: previous
      });
      continue;
    }
    if (!previous || !current) {
      continue;
    }
    if (
      previous.inferenceKillCount === current.inferenceKillCount &&
      previous.inferenceLossCount === current.inferenceLossCount &&
      arrayEquals(previous.killmailHead, current.killmailHead) &&
      arrayEquals(previous.lossmailHead, current.lossmailHead)
    ) {
      continue;
    }
    changes.push({
      pilotId,
      reason: "killmail-head-changed",
      before: previous,
      after: current
    });
  }

  return changes;
}

function classifyRemovedVisibleSuggestion(params: {
  characterId: number;
  previousSnapshot: FleetGroupingDiagnosticSnapshot;
  currentSnapshot: FleetGroupingDiagnosticSnapshot;
}): Record<string, unknown> {
  const previousVisible = params.previousSnapshot.visibleSuggestionById.get(params.characterId);
  const currentInternal = params.currentSnapshot.internalSuggestionById.get(params.characterId);

  if (params.currentSnapshot.selectedPilotIdSet.has(params.characterId)) {
    return {
      ...formatSuggestionDebug(previousVisible),
      reason: "promoted-to-selected"
    };
  }
  if (!currentInternal) {
    return {
      ...formatSuggestionDebug(previousVisible),
      reason: "no-current-cofly-evidence"
    };
  }
  if (!currentInternal.eligible) {
    return {
      ...formatSuggestionDebug(previousVisible),
      reason: "below-visibility-threshold",
      currentStrongestRatio: currentInternal.strongestRatio,
      currentStrongestSharedKillCount: currentInternal.strongestSharedKillCount,
      currentStrongestWindowKillCount: currentInternal.strongestWindowKillCount,
      currentSourcePilotIds: currentInternal.sourcePilotIds
    };
  }
  return {
    ...formatSuggestionDebug(previousVisible),
    reason: "trimmed-by-adaptive-cap",
    currentStrongestRatio: currentInternal.strongestRatio,
    currentStrongestSharedKillCount: currentInternal.strongestSharedKillCount,
    currentStrongestWindowKillCount: currentInternal.strongestWindowKillCount,
    currentSourcePilotIds: currentInternal.sourcePilotIds
  };
}

function formatSuggestionDebug(suggestion: SuggestedPilot | undefined): Record<string, unknown> {
  if (!suggestion) {
    return {};
  }
  return {
    characterId: suggestion.characterId,
    name: suggestion.name,
    strongestRatio: suggestion.strongestRatio,
    strongestSharedKillCount: suggestion.strongestSharedKillCount,
    strongestWindowKillCount: suggestion.strongestWindowKillCount,
    visibilityRatioThreshold: CO_FLY_RATIO_THRESHOLD,
    visibilityWindowMinKills: CO_FLY_RECENT_KILL_WINDOW_MIN,
    visibilityWindowMaxKills: CO_FLY_RECENT_KILL_WINDOW_MAX,
    sourcePilotIds: suggestion.sourcePilotIds
  };
}

function indexSuggestionsByCharacterId(suggestions: SuggestedPilot[]): ReadonlyMap<number, SuggestedPilot> {
  const byCharacterId = new Map<number, SuggestedPilot>();
  for (const suggestion of suggestions) {
    if (!Number.isInteger(suggestion.characterId) || suggestion.characterId <= 0 || byCharacterId.has(suggestion.characterId)) {
      continue;
    }
    byCharacterId.set(suggestion.characterId, suggestion);
  }
  return byCharacterId;
}

function collectKillmailHead(rows: PilotCard["inferenceKills"] | PilotCard["inferenceLosses"]): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    if (!Number.isInteger(row.killmail_id) || row.killmail_id <= 0) {
      continue;
    }
    ids.push(row.killmail_id);
    if (ids.length >= 4) {
      break;
    }
  }
  return ids;
}

function summarizeSourceSignature(sourceSignature: string): {
  preview: string;
  length: number;
  hash: string;
} {
  const previewMax = 96;
  return {
    preview: sourceSignature.length <= previewMax
      ? sourceSignature
      : `${sourceSignature.slice(0, previewMax)}...`,
    length: sourceSignature.length,
    hash: stableHashHex(sourceSignature)
  };
}

function stableHashHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizePilotIdsForDiagnostics(pilotIds: number[]): number[] {
  const ids = new Set<number>();
  for (const pilotId of pilotIds) {
    if (Number.isInteger(pilotId) && pilotId > 0) {
      ids.add(pilotId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function toValidPilotId(value?: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

