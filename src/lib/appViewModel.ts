import { aggregatePilotProgress } from "./appUtils";
import { computeFleetGrouping } from "./fleetGrouping";
import type { PilotCard } from "./pilotDomain";

export type GroupPresentation = {
  groupId?: string;
  groupColorToken?: string;
  isGreyedSuggestion: boolean;
  isUngrouped: boolean;
  suggestionStrongestRatio?: number;
  suggestionStrongestSharedKillCount?: number;
  suggestionStrongestWindowKillCount?: number;
  suggestionStrongestSourcePilotId?: number;
  suggestionStrongestSourcePilotName?: string;
};

const GROUP_COLOR_TOKEN_PREFIX = "fleet-group-color";

export function deriveAppViewModel(pilotCards: PilotCard[]): {
  copyableFleetCount: number;
  globalLoadProgress: number;
  showGlobalLoad: boolean;
} {
  const copyableFleetCount = pilotCards.filter((pilot) => Number.isFinite(pilot.characterId)).length;
  const globalLoadProgress = aggregatePilotProgress(pilotCards);
  const showGlobalLoad = pilotCards.length > 0 && globalLoadProgress < 1;

  return {
    copyableFleetCount,
    globalLoadProgress,
    showGlobalLoad
  };
}

export function sortPilotCardsByDanger(pilotCards: PilotCard[]): PilotCard[] {
  return pilotCards.slice().sort((a, b) => comparePilotCardsByDanger(a, b));
}

export function sortPilotCardsForFleetView(pilotCards: PilotCard[]): PilotCard[] {
  const groupingSeed = buildFleetGroupingSeed(pilotCards);
  if (groupingSeed.pilotCardsById.size === 0) {
    return groupingSeed.fallbackOrder;
  }

  const grouping = computeFleetGrouping({
    selectedPilotIds: groupingSeed.selectedPilotIds,
    pilotCardsById: groupingSeed.pilotCardsById,
    allKnownPilotNamesById: groupingSeed.allKnownPilotNamesById,
    nowMs: 0
  });
  if (grouping.groups.length === 0) {
    return groupingSeed.fallbackOrder;
  }

  const groupedSelectedOrder: PilotCard[] = [];
  const includedPilotIds = new Set<number>();
  for (const group of grouping.groups) {
    const selectedGroupPilots = group.selectedPilotIds
      .map((pilotId) => groupingSeed.pilotCardsById.get(pilotId))
      .filter((pilot): pilot is PilotCard => Boolean(pilot))
      .sort(comparePilotCardsByDanger);

    for (const selectedGroupPilot of selectedGroupPilots) {
      const pilotId = toValidPilotId(selectedGroupPilot.characterId);
      if (pilotId === null || includedPilotIds.has(pilotId)) {
        continue;
      }
      groupedSelectedOrder.push(selectedGroupPilot);
      includedPilotIds.add(pilotId);
    }
  }

  if (groupedSelectedOrder.length === 0) {
    return groupingSeed.fallbackOrder;
  }

  for (const pilot of groupingSeed.fallbackOrder) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId !== null && includedPilotIds.has(pilotId)) {
      continue;
    }
    groupedSelectedOrder.push(pilot);
  }

  return groupedSelectedOrder;
}

export function deriveGroupPresentationByPilotId(pilotCards: PilotCard[]): Map<number, GroupPresentation> {
  const groupingSeed = buildFleetGroupingSeed(pilotCards);
  if (groupingSeed.pilotCardsById.size === 0) {
    return new Map();
  }

  const grouping = computeFleetGrouping({
    selectedPilotIds: groupingSeed.selectedPilotIds,
    pilotCardsById: groupingSeed.pilotCardsById,
    allKnownPilotNamesById: groupingSeed.allKnownPilotNamesById,
    nowMs: 0
  });
  const suggestionByPilotId = new Map(
    grouping.suggestions.map((suggestion) => [suggestion.characterId, suggestion])
  );

  const presentationByPilotId = new Map<number, GroupPresentation>();
  const selectedPilotIdSet = new Set(groupingSeed.selectedPilotIds);
  for (const group of grouping.groups) {
    const groupColorToken = groupColorTokenForIndex(group.colorIndex);
    const suggestedPilotIdSet = new Set(group.suggestedPilotIds);
    for (const memberPilotId of group.memberPilotIds) {
      const isSuggested = suggestedPilotIdSet.has(memberPilotId) && !selectedPilotIdSet.has(memberPilotId);
      const suggestion = isSuggested ? suggestionByPilotId.get(memberPilotId) : undefined;
      const strongestSourcePilotId = suggestion?.strongestSourcePilotId ?? suggestion?.sourcePilotIds[0];
      const strongestSourcePilotName = strongestSourcePilotId
        ? resolvePilotNameById({
            pilotId: strongestSourcePilotId,
            allKnownPilotNamesById: groupingSeed.allKnownPilotNamesById,
            pilotCardsById: groupingSeed.pilotCardsById
          })
        : undefined;
      presentationByPilotId.set(memberPilotId, {
        groupId: group.groupId,
        groupColorToken,
        isGreyedSuggestion: isSuggested,
        isUngrouped: false,
        ...(isSuggested && suggestion
          ? {
              suggestionStrongestRatio: suggestion.strongestRatio,
              suggestionStrongestSharedKillCount: suggestion.strongestSharedKillCount,
              suggestionStrongestWindowKillCount: suggestion.strongestWindowKillCount,
              suggestionStrongestSourcePilotId: strongestSourcePilotId,
              suggestionStrongestSourcePilotName: strongestSourcePilotName
            }
          : {})
      });
    }
  }

  for (const selectedPilotId of groupingSeed.selectedPilotIds) {
    if (presentationByPilotId.has(selectedPilotId)) {
      continue;
    }
    presentationByPilotId.set(selectedPilotId, {
      isGreyedSuggestion: false,
      isUngrouped: true
    });
  }

  return presentationByPilotId;
}

function buildFleetGroupingSeed(pilotCards: PilotCard[]): {
  fallbackOrder: PilotCard[];
  selectedPilotIds: number[];
  pilotCardsById: Map<number, PilotCard>;
  allKnownPilotNamesById: Map<number, string>;
} {
  const fallbackOrder = sortPilotCardsByDanger(pilotCards);
  const pilotCardsById = new Map<number, PilotCard>();
  const allKnownPilotNamesById = new Map<number, string>();
  const selectedPilotIds: number[] = [];

  for (const pilot of fallbackOrder) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId === null) {
      continue;
    }
    selectedPilotIds.push(pilotId);
    if (!pilotCardsById.has(pilotId)) {
      pilotCardsById.set(pilotId, pilot);
    }
    const resolvedName = (pilot.characterName ?? pilot.parsedEntry.pilotName).trim();
    if (resolvedName.length > 0) {
      allKnownPilotNamesById.set(pilotId, resolvedName);
    }
  }

  return {
    fallbackOrder,
    selectedPilotIds,
    pilotCardsById,
    allKnownPilotNamesById
  };
}

function comparePilotCardsByDanger(a: PilotCard, b: PilotCard): number {
  const aDanger = normalizeDanger(a.stats?.danger);
  const bDanger = normalizeDanger(b.stats?.danger);
  const aMissing = aDanger === null;
  const bMissing = bDanger === null;

  if (aMissing && !bMissing) {
    return 1;
  }
  if (!aMissing && bMissing) {
    return -1;
  }
  if (!aMissing && !bMissing && aDanger !== bDanger) {
    return bDanger - aDanger;
  }

  const aName = (a.characterName ?? a.parsedEntry.pilotName).trim().toLowerCase();
  const bName = (b.characterName ?? b.parsedEntry.pilotName).trim().toLowerCase();
  return aName.localeCompare(bName);
}

function normalizeDanger(value?: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toValidPilotId(value?: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function groupColorTokenForIndex(colorIndex: number): string {
  if (!Number.isInteger(colorIndex) || colorIndex < 0) {
    return `${GROUP_COLOR_TOKEN_PREFIX}-0`;
  }
  return `${GROUP_COLOR_TOKEN_PREFIX}-${colorIndex}`;
}

function resolvePilotNameById(params: {
  pilotId: number;
  allKnownPilotNamesById: Map<number, string>;
  pilotCardsById: Map<number, PilotCard>;
}): string | undefined {
  const knownName = params.allKnownPilotNamesById.get(params.pilotId);
  if (knownName && knownName.trim().length > 0) {
    return knownName;
  }
  const pilotCardName = params.pilotCardsById.get(params.pilotId)?.characterName;
  if (pilotCardName && pilotCardName.trim().length > 0) {
    return pilotCardName;
  }
  return undefined;
}
