import { clearIndexedStore, getIndexedEnvelope, removeIndexedEnvelope, setIndexedEnvelope } from "./cache/indexedStore";
import {
  buildEnvelope,
  cleanupStaleVersionCache,
  clearLocalCache,
  getLocalCachedState,
  getLocalCachedStateStable,
  setLocalCachedEnvelope,
  setLocalCachedEnvelopeStable,
  stableKey,
  versionedKey
} from "./cache/localStore";
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

export { cleanupStaleVersionCache };

export function getCachedStateStable<T>(key: string): CacheLookup<T> {
  return getLocalCachedStateStable<T>(key);
}

export function getCachedStable<T>(key: string): T | null {
  return getLocalCachedStateStable<T>(key).value;
}

// Stable (version-independent) cache for truly immutable data such as killmail
// details (content-addressed by hash) and character name→ID mappings.
// Entries survive app updates; increment STABLE_PREFIX when the stored structure changes.

export async function getCachedStableAsync<T>(key: string): Promise<CacheLookup<T>> {
  const local = getLocalCachedStateStable<T>(key);
  if (local.value !== null) {
    return local;
  }

  const indexed = await getIndexedEnvelope<T>(stableKey(key));
  if (!indexed) {
    return { value: null, stale: false };
  }

  const now = Date.now();
  if (now > indexed.expiresAt) {
    await removeIndexedEnvelope(stableKey(key));
    return { value: null, stale: false };
  }

  const ttlMs = indexed.expiresAt - now;
  const staleMs = indexed.staleAt - now;
  // Promote to localStorage so next read is synchronous.
  void setLocalCachedEnvelopeStable(key, indexed, MAX_LOCAL_ITEM_BYTES, MAX_LOCAL_TOTAL_BYTES);

  return {
    value: indexed.value,
    stale: now > indexed.staleAt
  };
}

export async function setCachedStable<T>(key: string, value: T, ttlMs: number, staleMs = Math.floor(ttlMs / 2)): Promise<void> {
  const envelope = buildEnvelope(value, ttlMs, staleMs);
  void setLocalCachedEnvelopeStable(key, envelope, MAX_LOCAL_ITEM_BYTES, MAX_LOCAL_TOTAL_BYTES);
  void setIndexedEnvelope(stableKey(key), envelope);
}
