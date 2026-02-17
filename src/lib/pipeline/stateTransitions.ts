import type { ParsedPilotInput } from "../../types";
import type { PilotCard } from "../usePilotIntelPipeline";

export function createLoadingCard(entry: ParsedPilotInput): PilotCard {
  return {
    parsedEntry: entry,
    status: "loading",
    fetchPhase: "loading",
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

export function createErrorCard(entry: ParsedPilotInput, error: string): PilotCard {
  return {
    parsedEntry: entry,
    status: "error",
    fetchPhase: "error",
    error,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}
