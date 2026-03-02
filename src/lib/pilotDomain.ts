import type { ParsedPilotInput } from "../types";
import type { ZkillKillmail } from "./api/zkill";
import type { CynoRisk } from "./cyno";
import type { FitCandidate, PilotStats, ShipPrediction } from "./intel";

export type PilotCardStatus = "idle" | "loading" | "ready" | "error";

export type PilotFetchPhase = "loading" | "base" | "history" | "enriching" | "ready" | "error";

export type PilotCard = {
  parsedEntry: ParsedPilotInput;
  status: PilotCardStatus;
  fetchPhase?: PilotFetchPhase;
  error?: string;
  characterId?: number;
  characterName?: string;
  corporationId?: number;
  corporationName?: string;
  allianceId?: number;
  allianceName?: string;
  securityStatus?: number;
  stats?: PilotStats;
  predictedShips: ShipPrediction[];
  fitCandidates: FitCandidate[];
  cynoRisk?: CynoRisk;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  inferenceKills: ZkillKillmail[];
  inferenceLosses: ZkillKillmail[];
};
