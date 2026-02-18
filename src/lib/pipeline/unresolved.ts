import type { ParsedPilotInput } from "../../types";

export function collectUnresolvedEntries(
  entries: ParsedPilotInput[],
  idMap: Map<string, number>
): ParsedPilotInput[] {
  return entries.filter((entry) => !idMap.get(entry.pilotName.toLowerCase()));
}

export function buildUnresolvedPilotError(idResolveError: string | null): string {
  if (idResolveError) {
    return `Character unresolved (ESI IDs error: ${idResolveError})`;
  }
  return "Character not found in ESI.";
}
