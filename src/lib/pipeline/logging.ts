export function buildFallbackInferenceLog(params: {
  pilot: string;
  characterId: number;
  fallbackKills: number;
  fallbackLosses: number;
}): {
  pilot: string;
  characterId: number;
  fallbackKills: number;
  fallbackLosses: number;
} {
  return {
    pilot: params.pilot,
    characterId: params.characterId,
    fallbackKills: params.fallbackKills,
    fallbackLosses: params.fallbackLosses
  };
}

export function buildFetchedZkillDataLog(params: {
  pilot: string;
  characterId: number;
  kills: number;
  losses: number;
  hasZkillStats: boolean;
}): {
  pilot: string;
  characterId: number;
  kills: number;
  losses: number;
  zkillStats: boolean;
} {
  return {
    pilot: params.pilot,
    characterId: params.characterId,
    kills: params.kills,
    losses: params.losses,
    zkillStats: params.hasZkillStats
  };
}

export function buildDeepHistoryMergedLog(params: {
  pilot: string;
  inferenceKills: number;
  inferenceLosses: number;
}): {
  pilot: string;
  inferenceKills: number;
  inferenceLosses: number;
} {
  return {
    pilot: params.pilot,
    inferenceKills: params.inferenceKills,
    inferenceLosses: params.inferenceLosses
  };
}
