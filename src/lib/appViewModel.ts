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
