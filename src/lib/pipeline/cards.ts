import type { Dispatch, SetStateAction } from "react";
import type { PilotCard } from "../pilotDomain";
import type { CancelCheck, PilotCardUpdater } from "./types";

export function patchPilotCardRows(
  rows: PilotCard[],
  pilotName: string,
  patch: Partial<PilotCard>
): PilotCard[] {
  const normalizedPilotName = pilotName.toLowerCase();
  return rows.map((row) =>
    row.parsedEntry.pilotName.toLowerCase() === normalizedPilotName
      ? { ...row, ...patch }
      : row
  );
}

export function createPilotCardUpdater(params: {
  isCancelled: CancelCheck;
  setPilotCards: Dispatch<SetStateAction<PilotCard[]>>;
}): PilotCardUpdater {
  return (pilotName, patch) => {
    if (params.isCancelled()) {
      return;
    }
    params.setPilotCards((current) => patchPilotCardRows(current, pilotName, patch));
  };
}
