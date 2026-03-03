import type { ParsedPilotInput } from "../../types";
import type { ResolvedPilotTask } from "./breadthPipeline";

export function buildResolvedPilotTasks(
  entries: ParsedPilotInput[],
  idMap: Map<string, number>
): ResolvedPilotTask[] {
  return entries
    .map((entry) => ({ entry, characterId: idMap.get(entry.pilotName.toLowerCase()) }))
    .filter((item): item is { entry: ParsedPilotInput; characterId: number } => Boolean(item.characterId))
    .map((item) => ({ ...item, priority: "selected" as const }));
}
