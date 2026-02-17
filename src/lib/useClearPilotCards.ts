import { useCallback } from "react";
import type { PilotCard } from "./usePilotIntelPipeline";

export function useClearPilotCards(params: {
  setPilotCards: React.Dispatch<React.SetStateAction<PilotCard[]>>;
}): () => void {
  return useCallback(() => {
    params.setPilotCards([]);
  }, [params.setPilotCards]);
}
