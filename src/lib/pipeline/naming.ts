import { resolveUniverseNames } from "../api/esi";
import { withDogmaTypeNameFallback } from "../names";
import type { DogmaIndex } from "../dogma/index";
import type { DebugLogger, PipelineSignal, RetryBuilder } from "./types";

export async function resolveNamesSafely(params: {
  ids: number[];
  signal: PipelineSignal;
  onRetry: RetryBuilder;
  dogmaIndex: DogmaIndex | null;
  logDebug: DebugLogger;
}): Promise<Map<number, string>> {
  if (params.ids.length === 0) {
    return new Map<number, string>();
  }
  try {
    const namesById = await resolveUniverseNames(params.ids, params.signal, params.onRetry("ESI names"));
    const merged = withDogmaTypeNameFallback(params.ids, namesById, params.dogmaIndex);
    params.logDebug("Universe names resolved", {
      count: namesById.size,
      dogmaBackfilled: merged.backfilledCount
    });
    return merged.namesById;
  } catch {
    const merged = withDogmaTypeNameFallback(params.ids, new Map<number, string>(), params.dogmaIndex);
    params.logDebug("Universe names resolution failed; continuing with fallbacks.", {
      dogmaBackfilled: merged.backfilledCount
    });
    return merged.namesById;
  }
}
