import { fetchLatestKillsPaged, fetchLatestLossesPaged, type ZkillKillmail } from "../api/zkill";
import { mergeKillmailLists } from "./pure";
import { buildDeepHistoryMergedLog } from "./logging";
import type { DebugLogger, PipelineSignal, RetryBuilder } from "./types";

type StageTwoDeps = {
  fetchLatestKillsPaged: typeof fetchLatestKillsPaged;
  fetchLatestLossesPaged: typeof fetchLatestLossesPaged;
  mergeKillmailLists: typeof mergeKillmailLists;
};

const DEFAULT_DEPS: StageTwoDeps = {
  fetchLatestKillsPaged,
  fetchLatestLossesPaged,
  mergeKillmailLists
};

export async function fetchAndMergeStageTwoHistory(
  params: {
    pilotName: string;
    characterId: number;
    inferenceKills: ZkillKillmail[];
    inferenceLosses: ZkillKillmail[];
    maxPages: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    logDebug: DebugLogger;
  },
  deps: StageTwoDeps = DEFAULT_DEPS
): Promise<{
  mergedInferenceKills: ZkillKillmail[];
  mergedInferenceLosses: ZkillKillmail[];
}> {
  const [deepKills, deepLosses] = await Promise.all([
    deps.fetchLatestKillsPaged(
      params.characterId,
      params.maxPages,
      params.signal,
      params.onRetry("zKill deep kills")
    ),
    deps.fetchLatestLossesPaged(
      params.characterId,
      params.maxPages,
      params.signal,
      params.onRetry("zKill deep losses")
    )
  ]);

  const mergedInferenceKills = deps.mergeKillmailLists(params.inferenceKills, deepKills);
  const mergedInferenceLosses = deps.mergeKillmailLists(params.inferenceLosses, deepLosses);
  params.logDebug(
    "Pilot deep history merged",
    buildDeepHistoryMergedLog({
      pilot: params.pilotName,
      inferenceKills: mergedInferenceKills.length,
      inferenceLosses: mergedInferenceLosses.length
    })
  );

  return { mergedInferenceKills, mergedInferenceLosses };
}
