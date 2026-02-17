import { useState } from "react";
import type { ParsedPilotInput, Settings } from "../types";
import { type FitCandidate, type PilotStats, type ShipPrediction } from "./intel";
import type { ZkillKillmail } from "./api/zkill";
import type { DogmaIndex } from "./dogma/index";
import type { CynoRisk } from "./cyno";
import { usePilotIntelPipelineEffect } from "./usePilotIntelPipelineEffect";
import { useLatestRef } from "./useLatestRef";

export type PilotCard = {
  parsedEntry: ParsedPilotInput;
  status: "idle" | "loading" | "ready" | "error";
  fetchPhase?: "loading" | "base" | "history" | "enriching" | "ready" | "error";
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

export function usePilotIntelPipeline(params: {
  entries: ParsedPilotInput[];
  settings: Settings;
  dogmaIndex: DogmaIndex | null;
  logDebug: (message: string, data?: unknown) => void;
}): {
  pilotCards: PilotCard[];
  setPilotCards: React.Dispatch<React.SetStateAction<PilotCard[]>>;
  networkNotice: string;
  setNetworkNotice: React.Dispatch<React.SetStateAction<string>>;
} {
  const [pilotCards, setPilotCards] = useState<PilotCard[]>([]);
  const [networkNotice, setNetworkNotice] = useState<string>("");
  const logDebugRef = useLatestRef(params.logDebug);

  usePilotIntelPipelineEffect({
    entries: params.entries,
    settings: params.settings,
    dogmaIndex: params.dogmaIndex,
    logDebugRef,
    setPilotCards,
    setNetworkNotice
  });

  return { pilotCards, setPilotCards, networkNotice, setNetworkNotice };
}
