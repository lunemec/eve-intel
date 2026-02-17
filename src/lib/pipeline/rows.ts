import type { PilotStats } from "../intel";
import type { PilotCard } from "../usePilotIntelPipeline";
import type { ParsedPilotInput } from "../../types";
import type { ZkillKillmail } from "../api/zkill";

export function buildStageOneRow(params: {
  entry: ParsedPilotInput;
  characterId: number;
  character: {
    name: string;
    corporation_id: number;
    alliance_id?: number;
    security_status?: number;
  };
  namesById: Map<number, string>;
  stats: PilotStats;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  inferenceKills: ZkillKillmail[];
  inferenceLosses: ZkillKillmail[];
}): PilotCard {
  return {
    parsedEntry: params.entry,
    status: "ready",
    fetchPhase: "enriching",
    characterId: params.characterId,
    characterName: params.character.name,
    corporationId: params.character.corporation_id,
    corporationName: params.namesById.get(params.character.corporation_id),
    allianceId: params.character.alliance_id,
    allianceName: params.character.alliance_id ? params.namesById.get(params.character.alliance_id) : undefined,
    securityStatus: params.character.security_status,
    stats: params.stats,
    predictedShips: [],
    fitCandidates: [],
    kills: params.kills,
    losses: params.losses,
    inferenceKills: params.inferenceKills,
    inferenceLosses: params.inferenceLosses
  };
}

export function buildStageTwoRow(params: {
  stageOne: PilotCard;
  character: {
    corporation_id: number;
    alliance_id?: number;
  };
  namesById: Map<number, string>;
  inferenceKills: ZkillKillmail[];
  inferenceLosses: ZkillKillmail[];
}): PilotCard {
  return {
    ...params.stageOne,
    fetchPhase: "ready",
    corporationName: params.namesById.get(params.character.corporation_id),
    allianceName: params.character.alliance_id ? params.namesById.get(params.character.alliance_id) : undefined,
    inferenceKills: params.inferenceKills,
    inferenceLosses: params.inferenceLosses
  };
}
