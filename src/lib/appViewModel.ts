import { aggregatePilotProgress } from "./appUtils";
import type { PilotCard } from "./usePilotIntelPipeline";

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
