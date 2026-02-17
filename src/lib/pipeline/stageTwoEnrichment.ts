import type { DogmaIndex } from "../dogma/index";
import type { PilotCard } from "../usePilotIntelPipeline";
import type { ZkillKillmail } from "../api/zkill";
import { resolveNamesSafely } from "./naming";
import { buildStageTwoRow } from "./rows";
import { collectStageNameResolutionIds } from "./stages";
import type { DebugLogger, PipelineSignal, RetryBuilder } from "./types";

type StageTwoEnrichmentDeps = {
  collectStageNameResolutionIds: typeof collectStageNameResolutionIds;
  resolveNamesSafely: typeof resolveNamesSafely;
  buildStageTwoRow: typeof buildStageTwoRow;
};

const DEFAULT_DEPS: StageTwoEnrichmentDeps = {
  collectStageNameResolutionIds,
  resolveNamesSafely,
  buildStageTwoRow
};

export async function enrichStageTwoRow(
  params: {
    characterId: number;
    character: {
      corporation_id: number;
      alliance_id?: number;
    };
    inferenceKills: ZkillKillmail[];
    inferenceLosses: ZkillKillmail[];
    stageOneRow: PilotCard;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    dogmaIndex: DogmaIndex | null;
    logDebug: DebugLogger;
  },
  deps: StageTwoEnrichmentDeps = DEFAULT_DEPS
): Promise<{ stageTwoRow: PilotCard; namesById: Map<number, string> }> {
  const stageTwoIds = deps.collectStageNameResolutionIds({
    characterId: params.characterId,
    inferenceKills: params.inferenceKills,
    inferenceLosses: params.inferenceLosses,
    corporationId: params.character.corporation_id,
    allianceId: params.character.alliance_id
  });
  const namesById = await deps.resolveNamesSafely({
    ids: stageTwoIds,
    signal: params.signal,
    onRetry: params.onRetry,
    dogmaIndex: params.dogmaIndex,
    logDebug: params.logDebug
  });
  const stageTwoRow = deps.buildStageTwoRow({
    stageOne: params.stageOneRow,
    character: params.character,
    namesById,
    inferenceKills: params.inferenceKills,
    inferenceLosses: params.inferenceLosses
  });
  return { stageTwoRow, namesById };
}
