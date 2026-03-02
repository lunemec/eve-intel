import type { Settings } from "../../types";
import type { DogmaIndex } from "../dogma/index";
import type { PilotCard } from "../pilotDomain";
import { getCachedStateAsync, type CacheLookup } from "../cache";
import { buildDerivedInferenceKey, isDerivedInferenceUsable } from "./pure";
import { recomputeDerivedInference, type DerivedInference } from "./executors";
import type { DebugLogger } from "./types";

type DerivedInferenceDeps = {
  buildDerivedInferenceKey: typeof buildDerivedInferenceKey;
  getCachedStateAsync: <T>(key: string) => Promise<CacheLookup<T>>;
  isDerivedInferenceUsable: typeof isDerivedInferenceUsable;
  recomputeDerivedInference: typeof recomputeDerivedInference;
};

const DEFAULT_DEPS: DerivedInferenceDeps = {
  buildDerivedInferenceKey,
  getCachedStateAsync,
  isDerivedInferenceUsable,
  recomputeDerivedInference
};

export async function loadDerivedInferenceWithCache(
  params: {
    row: PilotCard;
    settings: Settings;
    namesById: Map<number, string>;
    dogmaIndex?: DogmaIndex | null;
    topShips: number;
    logDebug: DebugLogger;
  },
  deps: DerivedInferenceDeps = DEFAULT_DEPS
): Promise<DerivedInference> {
  const derivedKey = deps.buildDerivedInferenceKey({
    characterId: params.row.characterId!,
    lookbackDays: params.settings.lookbackDays,
    topShips: params.topShips,
    explicitShip: params.row.parsedEntry.explicitShip,
    kills: params.row.inferenceKills,
    losses: params.row.inferenceLosses
  });

  const cached = await deps.getCachedStateAsync<DerivedInference>(derivedKey);
  if (cached.value && deps.isDerivedInferenceUsable(cached.value, params.row.parsedEntry.explicitShip)) {
    params.logDebug("Derived inference cache hit", {
      pilot: params.row.parsedEntry.pilotName,
      stale: cached.stale,
      predicted: cached.value.predictedShips.length
    });
    if (cached.stale) {
      void deps.recomputeDerivedInference({
        row: params.row,
        settings: params.settings,
        namesById: params.namesById,
        dogmaIndex: params.dogmaIndex,
        cacheKey: derivedKey,
        debugLog: params.logDebug
      });
    }
    return cached.value;
  }

  params.logDebug("Derived inference cache miss/recompute", {
    pilot: params.row.parsedEntry.pilotName
  });
  return deps.recomputeDerivedInference({
    row: params.row,
    settings: params.settings,
    namesById: params.namesById,
    dogmaIndex: params.dogmaIndex,
    cacheKey: derivedKey,
    debugLog: params.logDebug
  });
}
