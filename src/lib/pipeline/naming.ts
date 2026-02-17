import { resolveUniverseNames } from "../api/esi";
import { withDogmaTypeNameFallback } from "../names";
import type { DogmaIndex } from "../dogma/index";

export async function resolveNamesSafely(params: {
  ids: number[];
  signal: AbortSignal | undefined;
  onRetry: (scope: string) => (info: { status: number; attempt: number; delayMs: number }) => void;
  dogmaIndex: DogmaIndex | null;
  logDebug: (message: string, data?: unknown) => void;
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
