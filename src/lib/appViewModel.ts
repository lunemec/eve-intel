import { aggregatePilotProgress } from "./appUtils";
import { computeFleetGrouping } from "./fleetGrouping";
import type { PilotCard } from "./pilotDomain";

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

  if (pilotCardsById.size === 0) {
    return fallbackOrder;
  }

  const grouping = computeFleetGrouping({
    selectedPilotIds,
    pilotCardsById,
    allKnownPilotNamesById,
    nowMs: 0
  });
  if (grouping.orderedPilotIds.length === 0) {
    return fallbackOrder;
  }

  const orderedPilotCards: PilotCard[] = [];
  const includedPilotIds = new Set<number>();
  for (const pilotId of grouping.orderedPilotIds) {
    const pilot = pilotCardsById.get(pilotId);
    if (!pilot || includedPilotIds.has(pilotId)) {
      continue;
    }
    orderedPilotCards.push(pilot);
    includedPilotIds.add(pilotId);
  }

  for (const pilot of fallbackOrder) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId !== null && includedPilotIds.has(pilotId)) {
      continue;
    }
    orderedPilotCards.push(pilot);
  }

  return orderedPilotCards;
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
