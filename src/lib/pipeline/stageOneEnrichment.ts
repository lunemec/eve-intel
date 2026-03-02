import type { DogmaIndex } from "../dogma/index";
import type { PilotStats } from "../intel";
import type { ParsedPilotInput } from "../../types";
import type { ZkillKillmail } from "../api/zkill";
import type { PilotCard } from "../pilotDomain";
import { collectStageNameResolutionIds } from "./stages";
import { resolveNamesSafely } from "./naming";
import { buildStageOneRow } from "./rows";
import type { DebugLogger, PipelineSignal, RetryBuilder } from "./types";

type StageOneEnrichmentDeps = {
  collectStageNameResolutionIds: typeof collectStageNameResolutionIds;
  resolveNamesSafely: typeof resolveNamesSafely;
  buildStageOneRow: typeof buildStageOneRow;
};

const DEFAULT_DEPS: StageOneEnrichmentDeps = {
  collectStageNameResolutionIds,
  resolveNamesSafely,
  buildStageOneRow
};

export async function enrichStageOneRow(
  params: {
    entry: ParsedPilotInput;
    characterId: number;
    character: {
      name: string;
      corporation_id: number;
      alliance_id?: number;
      security_status?: number;
    };
    stats: PilotStats;
    kills: ZkillKillmail[];
    losses: ZkillKillmail[];
    inferenceKills: ZkillKillmail[];
    inferenceLosses: ZkillKillmail[];
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    dogmaIndex: DogmaIndex | null;
    logDebug: DebugLogger;
  },
  deps: StageOneEnrichmentDeps = DEFAULT_DEPS
): Promise<{ stageOneRow: PilotCard; namesById: Map<number, string> }> {
  const stageOneIds = deps.collectStageNameResolutionIds({
    characterId: params.characterId,
    inferenceKills: params.inferenceKills,
    inferenceLosses: params.inferenceLosses,
    corporationId: params.character.corporation_id,
    allianceId: params.character.alliance_id
  });
  const namesById = await deps.resolveNamesSafely({
    ids: stageOneIds,
    signal: params.signal,
    onRetry: params.onRetry,
    dogmaIndex: params.dogmaIndex,
    logDebug: params.logDebug
  });
  const stageOneRow = deps.buildStageOneRow({
    entry: params.entry,
    characterId: params.characterId,
    character: params.character,
    namesById,
    stats: params.stats,
    kills: params.kills,
    losses: params.losses,
    inferenceKills: params.inferenceKills,
    inferenceLosses: params.inferenceLosses
  });

  return { stageOneRow, namesById };
}
