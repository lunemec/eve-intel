import type { ParsedPilotInput } from "../../types";

export function buildResolvedPilotTasks(
  entries: ParsedPilotInput[],
  idMap: Map<string, number>
): Array<{ entry: ParsedPilotInput; characterId: number }> {
  return entries
    .map((entry) => ({ entry, characterId: idMap.get(entry.pilotName.toLowerCase()) }))
    .filter((item): item is { entry: ParsedPilotInput; characterId: number } => Boolean(item.characterId));
}
