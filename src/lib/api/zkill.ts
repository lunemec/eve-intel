import { getCachedStateAsync, setCachedAsync } from "../cache";
import { fetchJsonWithMeta, fetchJsonWithMetaConditional, resolveHttpCachePolicy, type RetryInfo } from "./http";

const ZKILL_BASE = "https://zkillboard.com/api";
const ZKILL_CACHE_TTL_MS = 1000 * 60 * 10;
const ZKILL_PAGE_ONE_REVALIDATE_MS = 1000 * 30;
export const ZKILL_MAX_LOOKBACK_DAYS = 7;
const ESI_BASE = "https://esi.evetech.net/latest";
const ESI_DATASOURCE = "tranquility";
const KILLMAIL_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_HYDRATE = 50;
const HYDRATE_CONCURRENCY = 5;
const zkillRefreshInFlight = new Map<string, Promise<ZkillKillmail[]>>();

export type ZkillCacheEvent = {
  forceNetwork: boolean;
  status: number;
  notModified: boolean;
  requestEtag?: string;
  requestLastModified?: string;
  responseEtag?: string;
  responseLastModified?: string;
};

export type ZkillAttacker = {
  character_id?: number;
  ship_type_id?: number;
};

export type ZkillVictim = {
  character_id?: number;
  ship_type_id?: number;
};

export type ZkillItem = {
  item_type_id: number;
  flag?: number;
  charge_item_type_id?: number;
  quantity_destroyed?: number;
  quantity_dropped?: number;
};

export type ZkillKillmail = {
  killmail_id: number;
  killmail_time: string;
  solar_system_id?: number;
  victim: ZkillVictim & { items?: ZkillItem[] };
  attackers?: ZkillAttacker[];
  zkb?: {
    hash?: string;
    totalValue?: number;
  };
};

export type ZkillCharacterStats = {
  kills?: number;
  losses?: number;
  solo?: number;
  avgGangSize?: number;
  gangRatio?: number;
  danger?: number;
  iskDestroyed?: number;
  iskLost?: number;
};

type ZkillListCacheEnvelope = {
  rows: ZkillKillmail[];
  etag?: string;
  lastModified?: string;
  validatedAt: number;
};

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
    { aggressiveRevalidate: normalizedPage === 1, forceNetwork: options?.forceNetwork, onCacheEvent: options?.onCacheEvent }
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
    { aggressiveRevalidate: normalizedPage === 1, forceNetwork: options?.forceNetwork, onCacheEvent: options?.onCacheEvent }
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
    if (!Array.isArray(cachedRows)) {
      return refreshZkillListDeduped(url, cacheKey, onRetry, signal, normalizedEnvelope);
    }
    const normalizedCached = normalizeZkillArray(cachedRows);
    if (normalizedCached.length !== cachedRows.length) {
      const repaired = { ...normalizedEnvelope, rows: normalizedCached };
      await setCachedAsync(cacheKey, repaired, ZKILL_CACHE_TTL_MS);
    }
    if (normalizedCached.length === 0 && cachedRows.length > 0) {
      return refreshZkillListDeduped(url, cacheKey, onRetry, signal, normalizedEnvelope);
    }
    if (normalizedCached.length === 0) {
      // Empty cache entries can be stale/poisoned from transient upstream responses.
      try {
        return await refreshZkillListDeduped(url, cacheKey, onRetry, signal, normalizedEnvelope);
      } catch {
        return [];
      }
    }

    const needsAggressiveRevalidate =
      Boolean(options?.aggressiveRevalidate) &&
      Date.now() - normalizedEnvelope.validatedAt >= ZKILL_PAGE_ONE_REVALIDATE_MS;

    if (cached.stale) {
      void refreshZkillListDeduped(url, cacheKey, onRetry, undefined, normalizedEnvelope);
    } else if (needsAggressiveRevalidate) {
      void refreshZkillListDeduped(url, cacheKey, onRetry, undefined, normalizedEnvelope);
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
  const inFlightKey = `${cacheKey}|${signal ? "fg" : "bg"}`;
  const existing = zkillRefreshInFlight.get(inFlightKey);
  if (existing) {
    return existing;
  }

  const request = refreshZkillList(url, cacheKey, onRetry, signal, cachedEnvelope, options)
    .finally(() => {
      zkillRefreshInFlight.delete(inFlightKey);
    });
  zkillRefreshInFlight.set(inFlightKey, request);
  return request;
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
  const conditionalHeaders = cachedEnvelope
    ? {
        etag: cachedEnvelope.etag,
        lastModified: cachedEnvelope.lastModified
      }
    : undefined;

  const response = await fetchJsonWithMetaConditional<unknown>(
    url,
    {
      headers: {
        Accept: "application/json"
      }
    },
    12000,
    signal,
    onRetry,
    conditionalHeaders
  );
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

  const data = await parseZkillResponse(response.data, signal, onRetry);
  const cachePolicy = resolveHttpCachePolicy(response.headers, {
    fallbackTtlMs: ZKILL_CACHE_TTL_MS,
    fallbackStaleMs: ZKILL_CACHE_TTL_MS,
    fetchedAt: response.fetchedAt
  });
  if (cachePolicy.cacheable) {
    await setCachedAsync(
      cacheKey,
      {
        rows: data,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        validatedAt: response.fetchedAt
      },
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
    const response = await fetchJsonWithMeta<unknown>(
      `${ZKILL_BASE}/stats/characterID/${characterId}/`,
      {
        headers: {
          Accept: "application/json"
        }
      },
      12000,
      signal,
      onRetry
    );
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

async function parseZkillResponse(
  payload: unknown,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  if (!Array.isArray(payload)) {
    throw new Error(`Unexpected zKill payload (not array): ${formatPayloadSnippet(payload)}`);
  }
  const normalized = normalizeZkillArray(payload);
  if (normalized.length > 0) {
    const hydrationCandidates = findHydrationCandidates(payload);
    if (hydrationCandidates.length === 0) {
      return normalized;
    }

    const hydrated = await hydrateKillmailSummaries(hydrationCandidates.slice(0, MAX_HYDRATE), signal, onRetry);
    if (hydrated.length === 0) {
      return normalized;
    }

    const merged = new Map<number, ZkillKillmail>();
    for (const row of normalized) {
      merged.set(row.killmail_id, row);
    }
    for (const row of hydrated) {
      merged.set(row.killmail_id, row);
    }
    return [...merged.values()];
  }

  const summaryRows = (payload as unknown[]).filter(
    (entry): entry is { killmail_id: number; zkb?: { hash?: string; totalValue?: number } } =>
      Boolean(
        entry &&
          typeof entry === "object" &&
          typeof (entry as { killmail_id?: unknown }).killmail_id === "number" &&
          typeof (entry as { zkb?: { hash?: unknown } }).zkb?.hash === "string"
      )
  );

  if (summaryRows.length === 0) {
    return [];
  }

  return hydrateKillmailSummaries(summaryRows.slice(0, MAX_HYDRATE), signal, onRetry);
}

function findHydrationCandidates(
  payload: unknown
): Array<{ killmail_id: number; zkb?: { hash?: string; totalValue?: number } }> {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter(
    (entry): entry is { killmail_id: number; zkb?: { hash?: string; totalValue?: number } } => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const row = entry as Partial<ZkillKillmail>;
      if (typeof row.killmail_id !== "number" || typeof row.zkb?.hash !== "string") {
        return false;
      }

      const victimMissingShip = typeof row.victim?.ship_type_id !== "number";
      const attackers = row.attackers;
      const attackersMissingIdentity =
        !Array.isArray(attackers) ||
        attackers.length === 0 ||
        attackers.every((attacker) => typeof attacker.character_id !== "number" || typeof attacker.ship_type_id !== "number");

      return victimMissingShip || attackersMissingIdentity;
    }
  );
}

function normalizeZkillArray(payload: unknown[]): ZkillKillmail[] {
  return payload.filter((entry): entry is ZkillKillmail => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const row = entry as Partial<ZkillKillmail>;
    return typeof row.killmail_id === "number" && typeof row.killmail_time === "string";
  });
}

function normalizeListCacheEnvelope(value: ZkillKillmail[] | ZkillListCacheEnvelope | null): ZkillListCacheEnvelope | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return {
      rows: value,
      validatedAt: 0
    };
  }
  if (typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ZkillListCacheEnvelope>;
  if (!Array.isArray(candidate.rows)) {
    return null;
  }
  return {
    rows: candidate.rows,
    etag: typeof candidate.etag === "string" ? candidate.etag : undefined,
    lastModified: typeof candidate.lastModified === "string" ? candidate.lastModified : undefined,
    validatedAt: typeof candidate.validatedAt === "number" && Number.isFinite(candidate.validatedAt)
      ? candidate.validatedAt
      : 0
  };
}

function formatPayloadSnippet(payload: unknown): string {
  try {
    const raw = JSON.stringify(payload);
    return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
  } catch {
    return String(payload);
  }
}

function parseCharacterStats(payload: unknown): ZkillCharacterStats | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const kills = extractNumber(root, [
    "kills",
    "kills.all",
    "shipsDestroyed",
    "shipsDestroyed.all",
    "shipCountDestroyed",
    "shipCountDestroyed.all"
  ]);
  const losses = extractNumber(root, [
    "losses",
    "losses.all",
    "shipsLost",
    "shipsLost.all",
    "shipCountLost",
    "shipCountLost.all"
  ]);
  const solo = extractNumber(root, ["solo", "soloKills", "soloKills.all"]);
  const avgGangSize = extractNumber(root, [
    "avgGang",
    "avgGangSize",
    "averageGang",
    "averageGangSize",
    "gangAverage",
    "gang.average",
    "gang.avg",
    "gangAverage.all"
  ]);
  const gangRatioRaw = extractNumber(root, [
    "gangRatio",
    "gangPercent",
    "gang",
    "gangKillsRatio",
    "gang.value",
    "gang.all"
  ]);
  const dangerRaw = extractNumber(root, [
    "danger",
    "dangerRatio",
    "dangerous",
    "dangerousRatio",
    "dangerous.value",
    "dangerous.all"
  ]);
  const iskDestroyed = extractNumber(root, ["iskDestroyed", "isk.destroyed", "iskDestroyed.all"]);
  const iskLost = extractNumber(root, ["iskLost", "isk.lost", "iskLost.all"]);

  if (
    kills === undefined &&
    losses === undefined &&
    solo === undefined &&
    avgGangSize === undefined &&
    gangRatioRaw === undefined &&
    dangerRaw === undefined &&
    iskDestroyed === undefined &&
    iskLost === undefined
  ) {
    return null;
  }

  const gangRatio = normalizeDangerPercent(gangRatioRaw);
  const danger = normalizeDangerPercent(dangerRaw);
  return {
    kills,
    losses,
    solo,
    avgGangSize,
    gangRatio,
    danger,
    iskDestroyed,
    iskLost
  };
}

function extractNumber(root: Record<string, unknown>, candidates: string[]): number | undefined {
  for (const candidate of candidates) {
    const value = getByPath(root, candidate);
    const number = normalizeNumber(value);
    if (number !== undefined) {
      return number;
    }
  }
  return undefined;
}

function getByPath(root: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeDangerPercent(value?: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value <= 1) {
    return Number((value * 100).toFixed(1));
  }
  if (value <= 10) {
    return Number((value * 10).toFixed(1));
  }
  return Number(value.toFixed(1));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function hydrateKillmailSummaries(
  rows: Array<{ killmail_id: number; zkb?: { hash?: string; totalValue?: number } }>,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<ZkillKillmail[]> {
  const output: ZkillKillmail[] = [];

  for (let index = 0; index < rows.length; index += HYDRATE_CONCURRENCY) {
    const batch = rows.slice(index, index + HYDRATE_CONCURRENCY);
    const hydrated = await Promise.all(
      batch.map(async (row) => {
        const hash = row.zkb?.hash;
        if (!hash) {
          return null;
        }
        const details = await fetchKillmailDetails(row.killmail_id, hash, signal, onRetry);
        if (!details) {
          return null;
        }
        const normalized: ZkillKillmail = {
          ...details,
          zkb: {
            ...(details.zkb ?? {}),
            hash,
            totalValue: row.zkb?.totalValue ?? details.zkb?.totalValue
          }
        };
        return normalized;
      })
    );

    for (const entry of hydrated) {
      if (entry) {
        output.push(entry);
      }
    }
  }

  return output;
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
    const response = await fetchJsonWithMeta<{
      killmail_id: number;
      killmail_time: string;
      solar_system_id?: number;
      victim: ZkillKillmail["victim"];
      attackers?: ZkillKillmail["attackers"];
    }>(
      `${ESI_BASE}/killmails/${killmailId}/${hash}/?datasource=${ESI_DATASOURCE}`,
      undefined,
      12000,
      signal,
      onRetry
    );

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
