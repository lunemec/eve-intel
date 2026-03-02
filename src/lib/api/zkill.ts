import { getCachedStateAsync, setCachedAsync } from "../cache";
import { resolveHttpCachePolicy, type RetryInfo } from "./http";
import { buildListCacheEnvelope, normalizeListCacheEnvelope, toConditionalHeaders } from "./zkill/cachePolicy";
import {
  KILLMAIL_CACHE_TTL_MS,
  MAX_HYDRATE,
  ZKILL_BASE,
  ZKILL_CACHE_TTL_MS,
  ZKILL_MAX_LOOKBACK_DAYS,
  ZKILL_PAGE_ONE_REVALIDATE_MS
} from "./zkill/constants";
import { findHydrationCandidates, hydrateKillmailSummaries } from "./zkill/hydration";
import { normalizeZkillArray, parseCharacterStats, parseZkillResponse } from "./zkill/parsing";
import {
  fetchCharacterStatsTransport,
  fetchKillmailDetailsTransport,
  fetchZkillListTransport
} from "./zkill/transport";
import type {
  ZkillAttacker,
  ZkillCacheEvent,
  ZkillCharacterStats,
  ZkillItem,
  ZkillKillmail,
  ZkillListCacheEnvelope,
  ZkillVictim
} from "./zkill/types";

export { ZKILL_MAX_LOOKBACK_DAYS };
export type {
  ZkillAttacker,
  ZkillCacheEvent,
  ZkillCharacterStats,
  ZkillItem,
  ZkillKillmail,
  ZkillVictim
};

const zkillRefreshInFlight = new Map<string, Promise<ZkillKillmail[]>>();
const signalIdByAbortSignal = new WeakMap<AbortSignal, number>();
let nextAbortSignalId = 1;

export async function fetchRecentKills(
  characterId: number,
  lookbackDays: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  const pastSeconds = lookbackDaysToSeconds(lookbackDays);
  const key = `eve-intel.cache.zkill.kills.${characterId}.${lookbackDays}`;
  return fetchZkillList(
    `${ZKILL_BASE}/kills/characterID/${characterId}/pastSeconds/${pastSeconds}/`,
    key,
    signal,
    onRetry
  );
}

export async function fetchLatestKills(
  characterId: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  const key = `eve-intel.cache.zkill.kills.latest.${characterId}`;
  return fetchZkillList(`${ZKILL_BASE}/kills/characterID/${characterId}/`, key, signal, onRetry);
}

export async function fetchRecentLosses(
  characterId: number,
  lookbackDays: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  const pastSeconds = lookbackDaysToSeconds(lookbackDays);
  const key = `eve-intel.cache.zkill.losses.${characterId}.${lookbackDays}`;
  return fetchZkillList(
    `${ZKILL_BASE}/losses/characterID/${characterId}/pastSeconds/${pastSeconds}/`,
    key,
    signal,
    onRetry
  );
}

export async function fetchLatestLosses(
  characterId: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  const key = `eve-intel.cache.zkill.losses.latest.${characterId}`;
  return fetchZkillList(`${ZKILL_BASE}/losses/characterID/${characterId}/`, key, signal, onRetry);
}

export async function fetchLatestKillsPage(
  characterId: number,
  page: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void,
  options?: { forceNetwork?: boolean; onCacheEvent?: (event: ZkillCacheEvent) => void }
): Promise<ZkillKillmail[]> {
  const normalizedPage = Math.max(1, Math.floor(page));
  const cacheKey = `eve-intel.cache.zkill.kills.latest.${characterId}.page.${normalizedPage}`;
  return fetchZkillList(
    `${ZKILL_BASE}/kills/characterID/${characterId}/page/${normalizedPage}/`,
    cacheKey,
    signal,
    onRetry,
    {
      aggressiveRevalidate: normalizedPage === 1,
      forceNetwork: options?.forceNetwork,
      onCacheEvent: options?.onCacheEvent
    }
  );
}

export async function fetchLatestLossesPage(
  characterId: number,
  page: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void,
  options?: { forceNetwork?: boolean; onCacheEvent?: (event: ZkillCacheEvent) => void }
): Promise<ZkillKillmail[]> {
  const normalizedPage = Math.max(1, Math.floor(page));
  const cacheKey = `eve-intel.cache.zkill.losses.latest.${characterId}.page.${normalizedPage}`;
  return fetchZkillList(
    `${ZKILL_BASE}/losses/characterID/${characterId}/page/${normalizedPage}/`,
    cacheKey,
    signal,
    onRetry,
    {
      aggressiveRevalidate: normalizedPage === 1,
      forceNetwork: options?.forceNetwork,
      onCacheEvent: options?.onCacheEvent
    }
  );
}

export async function fetchLatestKillsPaged(
  characterId: number,
  maxPages: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  return fetchLatestPaged("kills", characterId, maxPages, signal, onRetry);
}

export async function fetchLatestLossesPaged(
  characterId: number,
  maxPages: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  return fetchLatestPaged("losses", characterId, maxPages, signal, onRetry);
}

export async function fetchCharacterStats(
  characterId: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillCharacterStats | null> {
  const cacheKey = `eve-intel.cache.zkill.stats.${characterId}`;
  const cached = await getCachedStateAsync<ZkillCharacterStats | null>(cacheKey);
  if (cached.value !== null) {
    if (cached.stale) {
      void refreshCharacterStats(characterId, cacheKey, signal, onRetry);
    }
    return cached.value;
  }
  return refreshCharacterStats(characterId, cacheKey, signal, onRetry);
}

async function fetchZkillList(
  url: string,
  cacheKey: string,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void,
  options?: {
    aggressiveRevalidate?: boolean;
    forceNetwork?: boolean;
    onCacheEvent?: (event: ZkillCacheEvent) => void;
  }
): Promise<ZkillKillmail[]> {
  const cached = await getCachedStateAsync<ZkillKillmail[] | ZkillListCacheEnvelope>(cacheKey);
  const normalizedEnvelope = normalizeListCacheEnvelope(cached.value);
  if (options?.forceNetwork) {
    return refreshZkillListDeduped(url, cacheKey, onRetry, signal, normalizedEnvelope ?? undefined, {
      forceNetwork: true,
      onCacheEvent: options.onCacheEvent
    });
  }

  if (normalizedEnvelope) {
    const cachedRows = normalizedEnvelope.rows;
    const normalizedCached = normalizeZkillArray(cachedRows);
    const envelopeForRefresh =
      normalizedCached.length === cachedRows.length
        ? normalizedEnvelope
        : {
            ...normalizedEnvelope,
            rows: normalizedCached
          };

    if (normalizedCached.length !== cachedRows.length) {
      await setCachedAsync(cacheKey, envelopeForRefresh, ZKILL_CACHE_TTL_MS);
    }
    if (normalizedCached.length === 0 && cachedRows.length > 0) {
      return refreshZkillListDeduped(url, cacheKey, onRetry, signal, envelopeForRefresh);
    }
    if (normalizedCached.length === 0) {
      // Empty cache entries can be stale/poisoned from transient upstream responses.
      try {
        return await refreshZkillListDeduped(url, cacheKey, onRetry, signal, envelopeForRefresh);
      } catch {
        return [];
      }
    }

    const needsAggressiveRevalidate =
      Boolean(options?.aggressiveRevalidate) &&
      Date.now() - envelopeForRefresh.validatedAt >= ZKILL_PAGE_ONE_REVALIDATE_MS;

    if (cached.stale) {
      void refreshZkillListDeduped(url, cacheKey, onRetry, undefined, envelopeForRefresh);
    } else if (needsAggressiveRevalidate) {
      void refreshZkillListDeduped(url, cacheKey, onRetry, undefined, envelopeForRefresh);
    }
    return normalizedCached;
  }

  return refreshZkillListDeduped(url, cacheKey, onRetry, signal);
}

async function fetchLatestPaged(
  side: "kills" | "losses",
  characterId: number,
  maxPages: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  const unique = new Map<number, ZkillKillmail>();
  const totalPages = Math.max(1, Math.floor(maxPages));

  for (let page = 1; page <= totalPages; page += 1) {
    const rows =
      side === "kills"
        ? await fetchLatestKillsPage(characterId, page, signal, onRetry)
        : await fetchLatestLossesPage(characterId, page, signal, onRetry);
    const beforeCount = unique.size;

    for (const row of rows) {
      unique.set(row.killmail_id, row);
    }

    // Stop only when endpoint is exhausted (no rows), or when paging no longer yields new killmails.
    // Some zKill list endpoints are effectively capped per page well below 200.
    if (rows.length === 0 || unique.size === beforeCount) {
      break;
    }
  }

  return [...unique.values()];
}

function lookbackDaysToSeconds(days: number): number {
  const clampedDays = Math.min(ZKILL_MAX_LOOKBACK_DAYS, Math.max(1, Math.floor(days)));
  return clampedDays * 24 * 60 * 60;
}

function refreshZkillListDeduped(
  url: string,
  cacheKey: string,
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal,
  cachedEnvelope?: ZkillListCacheEnvelope,
  options?: {
    forceNetwork?: boolean;
    onCacheEvent?: (event: ZkillCacheEvent) => void;
  }
): Promise<ZkillKillmail[]> {
  // Dedupe boundary: foreground refreshes only share work when they reuse the same AbortSignal.
  // This preserves abort isolation across concurrent UI refreshes with distinct controllers.
  const inFlightKey = `${cacheKey}|${resolveRefreshScopeKey(signal)}`;
  const existing = zkillRefreshInFlight.get(inFlightKey);
  if (existing) {
    return existing;
  }

  const request = refreshZkillList(url, cacheKey, onRetry, signal, cachedEnvelope, options).finally(() => {
    zkillRefreshInFlight.delete(inFlightKey);
  });
  zkillRefreshInFlight.set(inFlightKey, request);
  return request;
}

function resolveRefreshScopeKey(signal?: AbortSignal): string {
  if (!signal) {
    return "bg";
  }
  let signalId = signalIdByAbortSignal.get(signal);
  if (!signalId) {
    signalId = nextAbortSignalId;
    nextAbortSignalId += 1;
    signalIdByAbortSignal.set(signal, signalId);
  }
  return `fg:${signalId}`;
}

async function refreshZkillList(
  url: string,
  cacheKey: string,
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal,
  cachedEnvelope?: ZkillListCacheEnvelope,
  options?: {
    forceNetwork?: boolean;
    onCacheEvent?: (event: ZkillCacheEvent) => void;
  }
): Promise<ZkillKillmail[]> {
  const conditionalHeaders = toConditionalHeaders(cachedEnvelope);
  const response = await fetchZkillListTransport(url, signal, onRetry, conditionalHeaders);

  options?.onCacheEvent?.({
    forceNetwork: Boolean(options?.forceNetwork),
    status: response.status,
    notModified: response.notModified,
    requestEtag: conditionalHeaders?.etag,
    requestLastModified: conditionalHeaders?.lastModified,
    responseEtag: response.headers.get("etag") ?? undefined,
    responseLastModified: response.headers.get("last-modified") ?? undefined
  });

  if (response.notModified) {
    if (!cachedEnvelope) {
      return [];
    }

    const cachePolicy = resolveHttpCachePolicy(response.headers, {
      fallbackTtlMs: ZKILL_CACHE_TTL_MS,
      fallbackStaleMs: ZKILL_CACHE_TTL_MS,
      fetchedAt: response.fetchedAt
    });
    if (cachePolicy.cacheable) {
      await setCachedAsync(
        cacheKey,
        {
          ...cachedEnvelope,
          validatedAt: response.fetchedAt
        },
        cachePolicy.ttlMs,
        cachePolicy.staleMs
      );
    }
    return cachedEnvelope.rows;
  }

  if (response.data === null) {
    return cachedEnvelope?.rows ?? [];
  }

  const data = await parseZkillResponse(response.data, {
    maxHydrate: MAX_HYDRATE,
    signal,
    onRetry,
    findHydrationCandidates,
    hydrateSummaries: async (rows, hydrateSignal, hydrateRetry) =>
      hydrateKillmailSummaries(rows, fetchKillmailDetails, hydrateSignal, hydrateRetry)
  });

  const cachePolicy = resolveHttpCachePolicy(response.headers, {
    fallbackTtlMs: ZKILL_CACHE_TTL_MS,
    fallbackStaleMs: ZKILL_CACHE_TTL_MS,
    fetchedAt: response.fetchedAt
  });
  if (cachePolicy.cacheable) {
    await setCachedAsync(
      cacheKey,
      buildListCacheEnvelope(data, {
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        validatedAt: response.fetchedAt
      }),
      cachePolicy.ttlMs,
      cachePolicy.staleMs
    );
  }
  return data;
}

async function refreshCharacterStats(
  characterId: number,
  cacheKey: string,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillCharacterStats | null> {
  try {
    const response = await fetchCharacterStatsTransport(characterId, signal, onRetry);
    const stats = parseCharacterStats(response.data);
    const cachePolicy = resolveHttpCachePolicy(response.headers, {
      fallbackTtlMs: ZKILL_CACHE_TTL_MS,
      fallbackStaleMs: ZKILL_CACHE_TTL_MS,
      fetchedAt: response.fetchedAt
    });
    if (cachePolicy.cacheable) {
      await setCachedAsync(cacheKey, stats, cachePolicy.ttlMs, cachePolicy.staleMs);
    }
    return stats;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    await setCachedAsync(cacheKey, null, 1000 * 60 * 5);
    return null;
  }
}

async function fetchKillmailDetails(
  killmailId: number,
  hash: string,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail | null> {
  const cacheKey = `eve-intel.cache.killmail.${killmailId}.${hash}`;
  const cached = await getCachedStateAsync<ZkillKillmail>(cacheKey);
  if (cached.value) {
    return cached.value;
  }

  try {
    const response = await fetchKillmailDetailsTransport(killmailId, hash, signal, onRetry);
    const normalized: ZkillKillmail = {
      killmail_id: response.data.killmail_id,
      killmail_time: response.data.killmail_time,
      solar_system_id: response.data.solar_system_id,
      victim: response.data.victim,
      attackers: response.data.attackers
    };

    const cachePolicy = resolveHttpCachePolicy(response.headers, {
      fallbackTtlMs: KILLMAIL_CACHE_TTL_MS,
      fallbackStaleMs: KILLMAIL_CACHE_TTL_MS,
      fetchedAt: response.fetchedAt
    });
    if (cachePolicy.cacheable) {
      await setCachedAsync(cacheKey, normalized, cachePolicy.ttlMs, cachePolicy.staleMs);
    }
    return normalized;
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
