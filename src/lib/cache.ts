import { clearIndexedStore, getIndexedEnvelope, removeIndexedEnvelope, setIndexedEnvelope } from "./cache/indexedStore";
import { buildEnvelope, clearLocalCache, getLocalCachedState, setLocalCachedEnvelope, versionedKey } from "./cache/localStore";
import {
  MAX_LOCAL_ITEM_BYTES,
  MAX_LOCAL_TOTAL_BYTES,
  type CacheLookup
} from "./cache/types";

export type { CacheLookup } from "./cache/types";

export function getCached<T>(key: string): T | null {
  return getCachedState<T>(key).value;
}

export function getCachedState<T>(key: string): CacheLookup<T> {
  return getLocalCachedState<T>(key);
}

export function setCached<T>(key: string, value: T, ttlMs: number, staleMs = Math.floor(ttlMs / 2)): void {
  const envelope = buildEnvelope(value, ttlMs, staleMs);
  void setLocalCachedEnvelope(key, envelope, MAX_LOCAL_ITEM_BYTES, MAX_LOCAL_TOTAL_BYTES);
  void setIndexedEnvelope(versionedKey(key), envelope);
}

export async function getCachedStateAsync<T>(key: string): Promise<CacheLookup<T>> {
  const local = getCachedState<T>(key);
  if (local.value !== null) {
    return local;
  }

  const indexed = await getIndexedEnvelope<T>(versionedKey(key));
  if (!indexed) {
    return { value: null, stale: false };
  }

  const now = Date.now();
  if (now > indexed.expiresAt) {
    await removeIndexedEnvelope(versionedKey(key));
    return { value: null, stale: false };
  }

  const ttlMs = indexed.expiresAt - now;
  const staleMs = indexed.staleAt - now;
  setCached(key, indexed.value, ttlMs, staleMs);

  return {
    value: indexed.value,
    stale: now > indexed.staleAt
  };
}

export async function setCachedAsync<T>(key: string, value: T, ttlMs: number, staleMs = Math.floor(ttlMs / 2)): Promise<void> {
  setCached(key, value, ttlMs, staleMs);
}

export async function clearIntelCache(): Promise<void> {
  try {
    clearLocalCache();
  } catch {
    // Ignore localStorage clear failures.
  }

  await clearIndexedStore();
}
