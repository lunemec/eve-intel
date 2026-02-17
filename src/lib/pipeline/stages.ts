import type { ZkillKillmail } from "../api/zkill";
import { collectItemTypeIds, collectShipTypeIdsForNaming } from "../intel";

export function collectStageNameResolutionIds(params: {
  characterId: number;
  inferenceKills: ZkillKillmail[];
  inferenceLosses: ZkillKillmail[];
  corporationId?: number;
  allianceId?: number;
}): number[] {
  return [
    ...collectShipTypeIdsForNaming(params.inferenceKills, params.inferenceLosses, params.characterId),
    ...collectItemTypeIds(params.inferenceLosses),
    params.corporationId,
    params.allianceId
  ].filter((value): value is number => Number.isFinite(value));
}

export function buildRetryNotice(
  scope: string,
  info: { status: number; attempt: number; delayMs: number }
): string {
  return `${scope}: rate-limited/retryable response (${info.status}), retry ${info.attempt} in ${info.delayMs}ms`;
}
