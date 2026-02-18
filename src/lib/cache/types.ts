export type CacheEnvelope<T> = {
  writtenAt: number;
  staleAt: number;
  expiresAt: number;
  value: T;
};

export type CacheLookup<T> = {
  value: T | null;
  stale: boolean;
};

export const CACHE_VERSION = "v4";
export const CACHE_PREFIX = `eve-intel.${CACHE_VERSION}.`;
export const MAX_LOCAL_ITEM_BYTES = 250_000;
export const MAX_LOCAL_TOTAL_BYTES = 4_500_000;
