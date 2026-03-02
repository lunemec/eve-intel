import { useState } from "react";
import type { ParsedPilotInput, Settings } from "../types";
import type { DogmaIndex } from "./dogma/index";
import type { PilotCard } from "./pilotDomain";
import { usePilotIntelPipelineEffect } from "./usePilotIntelPipelineEffect";
import { useLatestRef } from "./useLatestRef";

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
