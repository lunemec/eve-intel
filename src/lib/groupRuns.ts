import type { GroupPresentation } from "./appViewModel";
import type { PilotCard } from "./pilotDomain";

export type GroupRunPosition = "single" | "start" | "middle" | "end";

export function deriveGroupRunPositionsByIndex(
  pilotCards: PilotCard[],
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation> | undefined
): Array<GroupRunPosition | undefined> {
  if (!groupPresentationByPilotId || pilotCards.length === 0) {
    return pilotCards.map(() => undefined);
  }

  const groupIdsByIndex = pilotCards.map((pilot) => {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId === null) {
      return undefined;
    }
    const groupId = groupPresentationByPilotId.get(pilotId)?.groupId;
    if (!groupId || groupId.trim().length === 0) {
      return undefined;
    }
    return groupId;
  });

  return groupIdsByIndex.map((groupId, index): GroupRunPosition | undefined => {
    if (!groupId) {
      return undefined;
    }
    const previousMatches = index > 0 && groupIdsByIndex[index - 1] === groupId;
    const nextMatches = index + 1 < groupIdsByIndex.length && groupIdsByIndex[index + 1] === groupId;
    if (!previousMatches && !nextMatches) {
      return "single";
    }
    if (!previousMatches) {
      return "start";
    }
    if (!nextMatches) {
      return "end";
    }
    return "middle";
  });
}

function toValidPilotId(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}
