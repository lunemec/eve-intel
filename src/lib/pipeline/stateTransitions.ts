import type { ParsedPilotInput } from "../../types";
import type { PilotCard } from "../pilotDomain";

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

export function createErrorCard(entry: ParsedPilotInput, error: string, existing?: PilotCard): PilotCard {
  return {
    ...createLoadingCard(entry),
    ...(existing ?? {}),
    status: "error",
    fetchPhase: "error",
    error
  };
}
