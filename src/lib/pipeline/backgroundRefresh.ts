import type { ParsedPilotInput } from "../../types";
import { toPilotKey } from "./pilotIdentity";

export type PilotRefreshHead = {
  kills: string;
  losses: string;
};

export type BackgroundRefreshCandidate = {
  entry: ParsedPilotInput;
  pilotKey: string;
  characterId: number;
  forceNetwork: boolean;
};

export function collectBackgroundRefreshCandidates(params: {
  entries: ParsedPilotInput[];
  isPilotRunActive: (pilotKey: string) => boolean;
  refreshInFlightByPilotKey: Set<string>;
  characterIdByPilotKey: Map<string, number>;
  forceRefreshByPilotKey: Set<string>;
}): BackgroundRefreshCandidate[] {
  const candidates: BackgroundRefreshCandidate[] = [];
  const seenPilotKeys = new Set<string>();
  for (const entry of params.entries) {
    const pilotKey = toPilotKey(entry.pilotName);
    if (seenPilotKeys.has(pilotKey)) {
      continue;
    }
    seenPilotKeys.add(pilotKey);
    if (params.isPilotRunActive(pilotKey)) {
      continue;
    }
    if (params.refreshInFlightByPilotKey.has(pilotKey)) {
      continue;
    }
    const characterId = params.characterIdByPilotKey.get(pilotKey);
    if (!Number.isFinite(characterId)) {
      continue;
    }
    candidates.push({
      entry,
      pilotKey,
      characterId: characterId as number,
      forceNetwork: params.forceRefreshByPilotKey.has(pilotKey)
    });
  }
  return candidates;
}

export function updatePilotRefreshHead(params: {
  latestHeadByPilotKey: Map<string, PilotRefreshHead>;
  pilotKey: string;
  nextHead: PilotRefreshHead;
}): "initial" | "unchanged" | "changed" {
  const previous = params.latestHeadByPilotKey.get(params.pilotKey);
  params.latestHeadByPilotKey.set(params.pilotKey, params.nextHead);
  if (!previous) {
    return "initial";
  }
  if (previous.kills === params.nextHead.kills && previous.losses === params.nextHead.losses) {
    return "unchanged";
  }
  return "changed";
}
