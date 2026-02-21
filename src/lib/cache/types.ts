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

const PACKAGE_VERSION = (import.meta.env?.PACKAGE_VERSION ?? "0.0.0").trim();
const CACHE_VERSION_SAFE = PACKAGE_VERSION.replace(/[^0-9A-Za-z.-]/g, "_");

export const CACHE_VERSION = `app-${CACHE_VERSION_SAFE}`;
export const CACHE_PREFIX = `eve-intel.${CACHE_VERSION}.`;
export const MAX_LOCAL_ITEM_BYTES = 250_000;
export const MAX_LOCAL_TOTAL_BYTES = 4_500_000;
