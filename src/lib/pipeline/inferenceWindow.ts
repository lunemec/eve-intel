import type { CharacterPublic } from "../api/esi";
import { fetchCharacterPublic } from "../api/esi";
import {
  fetchCharacterStats,
  fetchLatestKills,
  fetchLatestLosses,
  fetchRecentKills,
  fetchRecentLosses,
  type ZkillCharacterStats,
  type ZkillKillmail
} from "../api/zkill";
import { buildFallbackInferenceLog, buildFetchedZkillDataLog } from "./logging";
import type { DebugLogger, PipelineSignal, RetryBuilder } from "./types";

type InferenceWindowDeps = {
  fetchCharacterPublic: typeof fetchCharacterPublic;
  fetchRecentKills: typeof fetchRecentKills;
  fetchRecentLosses: typeof fetchRecentLosses;
  fetchLatestKills: typeof fetchLatestKills;
  fetchLatestLosses: typeof fetchLatestLosses;
  fetchCharacterStats: typeof fetchCharacterStats;
};

const DEFAULT_DEPS: InferenceWindowDeps = {
  fetchCharacterPublic,
  fetchRecentKills,
  fetchRecentLosses,
  fetchLatestKills,
  fetchLatestLosses,
  fetchCharacterStats
};

export async function fetchPilotInferenceWindow(
  params: {
    pilotName: string;
    characterId: number;
    lookbackDays: number;
    signal: PipelineSignal;
    onRetry: RetryBuilder;
    logDebug: DebugLogger;
  },
  deps: InferenceWindowDeps = DEFAULT_DEPS
): Promise<{
  character: CharacterPublic;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
  zkillStats: ZkillCharacterStats | null;
  inferenceKills: ZkillKillmail[];
  inferenceLosses: ZkillKillmail[];
}> {
  const [character, kills, losses, zkillStats] = await Promise.all([
    deps.fetchCharacterPublic(params.characterId, params.signal, params.onRetry("ESI character")),
    deps.fetchRecentKills(params.characterId, params.lookbackDays, params.signal, params.onRetry("zKill kills")),
    deps.fetchRecentLosses(params.characterId, params.lookbackDays, params.signal, params.onRetry("zKill losses")),
    deps.fetchCharacterStats(params.characterId, params.signal, params.onRetry("zKill stats"))
  ]);

  let inferenceKills = kills;
  let inferenceLosses = losses;
  if (kills.length === 0) {
    inferenceKills = await deps.fetchLatestKills(params.characterId, params.signal, params.onRetry("zKill latest kills"));
  }
  if (losses.length === 0) {
    inferenceLosses = await deps.fetchLatestLosses(params.characterId, params.signal, params.onRetry("zKill latest losses"));
  }
  if (kills.length === 0 || losses.length === 0) {
    params.logDebug(
      "Fallback zKill inference window used",
      buildFallbackInferenceLog({
        pilot: params.pilotName,
        characterId: params.characterId,
        fallbackKills: inferenceKills.length,
        fallbackLosses: inferenceLosses.length
      })
    );
  }
  params.logDebug(
    "Fetched zKill data",
    buildFetchedZkillDataLog({
      pilot: params.pilotName,
      characterId: params.characterId,
      kills: kills.length,
      losses: losses.length,
      hasZkillStats: Boolean(zkillStats)
    })
  );

  return {
    character,
    kills,
    losses,
    zkillStats,
    inferenceKills,
    inferenceLosses
  };
}
