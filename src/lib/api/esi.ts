import { getCachedState, getCachedStateAsync, setCachedAsync } from "../cache";
import { fetchJsonWithMeta, resolveHttpCachePolicy, type RetryInfo } from "./http";

const ESI_BASE = "https://esi.evetech.net/latest";
const DATASOURCE = "tranquility";
const NAME_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180;
const NAME_MISS_CACHE_TTL_MS = 1000 * 60 * 15;
const CHARACTER_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const TYPE_SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const TYPE_SEARCH_MISS_TTL_MS = 1000 * 60 * 60 * 6;
const UNIVERSE_NAMES_BATCH_SIZE = 900;
const CACHE_MISS_PRESENT = 1;

const characterIdsInFlight = new Map<string, Promise<EsiIdsResponse>>();
const characterPublicInFlight = new Map<number, Promise<CharacterPublic>>();
const inventoryTypeInFlight = new Map<string, Promise<number>>();

type EsiIdsResponse = {
  characters?: Array<{ id: number; name: string }>;
  inventory_types?: Array<{ id: number; name: string }>;
};

type EsiNameResponse = Array<{
  id: number;
  name: string;
}>;

export type CharacterPublic = {
  character_id: number;
  corporation_id: number;
  alliance_id?: number;
  name: string;
  security_status?: number;
};

export async function resolveCharacterIds(
  names: string[],
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const normalizedToOriginal = new Map<string, string>();
  for (const rawName of names) {
    const normalized = normalizeName(rawName);
    if (!normalized || normalizedToOriginal.has(normalized)) {
      continue;
    }
    normalizedToOriginal.set(normalized, rawName.trim());
  }
  const unique = [...normalizedToOriginal.keys()];
  const toFetch: string[] = [];

  for (const normalized of unique) {
    const cacheKey = characterNameCacheKey(normalized);
    const cached = getCachedState<number>(cacheKey);
    if (cached.value) {
      map.set(normalized, cached.value);
      if (cached.stale) {
        toFetch.push(normalizedToOriginal.get(normalized)!);
      }
      continue;
    }

    const missCached = getCachedState<number>(characterNameMissCacheKey(normalized));
    if (missCached.value === CACHE_MISS_PRESENT) {
      if (missCached.stale) {
        toFetch.push(normalizedToOriginal.get(normalized)!);
      }
      continue;
    }

    toFetch.push(normalizedToOriginal.get(normalized)!);
  }

  if (toFetch.length === 0) {
    return map;
  }

  if (toFetch.length > 0 && map.size === unique.length) {
    void refreshCharacterIdsDeduped(toFetch, onRetry);
    return map;
  }

  const data = await refreshCharacterIdsDeduped(toFetch, onRetry, signal);
  for (const character of data.characters ?? []) {
    map.set(character.name.toLowerCase(), character.id);
  }

  return map;
}

export async function fetchCharacterPublic(
  characterId: number,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<CharacterPublic> {
  const key = `eve-intel.cache.character.${characterId}`;
  const cached = await getCachedStateAsync<CharacterPublic>(key);
  if (cached.value) {
    if (cached.stale) {
      void refreshCharacterPublicDeduped(characterId, onRetry);
    }
    return cached.value;
  }

  return refreshCharacterPublicDeduped(characterId, onRetry, signal);
}

export async function resolveUniverseNames(
  ids: number[],
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) {
    return resolved;
  }

  const toFetch: number[] = [];
  for (const id of unique) {
    const cacheKey = `eve-intel.cache.universe-name.${id}`;
    const cached = getCachedState<string>(cacheKey);
    if (cached.value) {
      resolved.set(id, cached.value);
      if (cached.stale) {
        toFetch.push(id);
      }
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) {
    return resolved;
  }

  if (resolved.size === unique.length) {
    void refreshUniverseNames(toFetch, onRetry);
    return resolved;
  }

  let lastError: unknown;
  for (let offset = 0; offset < toFetch.length; offset += UNIVERSE_NAMES_BATCH_SIZE) {
    const batch = toFetch.slice(offset, offset + UNIVERSE_NAMES_BATCH_SIZE);
    try {
      const data = await refreshUniverseNames(batch, onRetry, signal);
      for (const row of data) {
        resolved.set(row.id, row.name);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }
  }

  if (resolved.size === 0 && lastError) {
    throw lastError;
  }

  return resolved;
}

export async function resolveInventoryTypeIdByName(
  name: string,
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
): Promise<number | undefined> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const cacheKey = `eve-intel.cache.inventory-type.${normalized}`;
  const cached = getCachedState<number>(cacheKey);
  if (cached.value) {
    if (cached.stale) {
      void refreshInventoryTypeIdByNameDeduped(name, onRetry);
    }
    return cached.value > 0 ? cached.value : undefined;
  }

  const resolved = await refreshInventoryTypeIdByNameDeduped(name, onRetry, signal);
  return resolved > 0 ? resolved : undefined;
}

async function refreshCharacterIds(
  names: string[],
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<EsiIdsResponse> {
  const normalizedRequested = new Set(names.map((name) => normalizeName(name)).filter(Boolean));
  const response = await fetchJsonWithMeta<EsiIdsResponse>(
    `${ESI_BASE}/universe/ids/?datasource=${DATASOURCE}&language=en`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(names)
    },
    undefined,
    signal,
    onRetry
  );
  const data = response.data;
  const hitPolicy = resolveHttpCachePolicy(response.headers, {
    fallbackTtlMs: NAME_CACHE_TTL_MS,
    fallbackStaleMs: NAME_CACHE_TTL_MS,
    fetchedAt: response.fetchedAt
  });
  const missPolicy = resolveHttpCachePolicy(response.headers, {
    fallbackTtlMs: NAME_MISS_CACHE_TTL_MS,
    fallbackStaleMs: NAME_MISS_CACHE_TTL_MS,
    fetchedAt: response.fetchedAt
  });

  const writes: Array<Promise<void>> = [];
  const normalizedResolved = new Set<string>();
  for (const character of data.characters ?? []) {
    const normalized = normalizeName(character.name);
    if (!normalized) {
      continue;
    }
    normalizedResolved.add(normalized);
    if (hitPolicy.cacheable) {
      writes.push(setCachedAsync(characterNameCacheKey(normalized), character.id, hitPolicy.ttlMs, hitPolicy.staleMs));
    }
  }

  for (const normalized of normalizedRequested) {
    if (normalizedResolved.has(normalized)) {
      continue;
    }
    if (missPolicy.cacheable) {
      writes.push(
        setCachedAsync(characterNameMissCacheKey(normalized), CACHE_MISS_PRESENT, missPolicy.ttlMs, missPolicy.staleMs)
      );
    }
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }

  return data;
}

async function refreshCharacterPublic(
  characterId: number,
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<CharacterPublic> {
  const response = await fetchJsonWithMeta<CharacterPublic>(
    `${ESI_BASE}/characters/${characterId}/?datasource=${DATASOURCE}`,
    undefined,
    undefined,
    signal,
    onRetry
  );
  const policy = resolveHttpCachePolicy(response.headers, {
    fallbackTtlMs: CHARACTER_CACHE_TTL_MS,
    fallbackStaleMs: CHARACTER_CACHE_TTL_MS,
    fetchedAt: response.fetchedAt
  });
  if (policy.cacheable) {
    await setCachedAsync(`eve-intel.cache.character.${characterId}`, response.data, policy.ttlMs, policy.staleMs);
  }
  return response.data;
}

async function refreshUniverseNames(
  ids: number[],
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<EsiNameResponse> {
  const response = await fetchJsonWithMeta<EsiNameResponse>(
    `${ESI_BASE}/universe/names/?datasource=${DATASOURCE}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ids)
    },
    undefined,
    signal,
    onRetry
  );
  const data = response.data;
  const policy = resolveHttpCachePolicy(response.headers, {
    fallbackTtlMs: NAME_CACHE_TTL_MS,
    fallbackStaleMs: NAME_CACHE_TTL_MS,
    fetchedAt: response.fetchedAt
  });

  const writes: Array<Promise<void>> = [];
  if (policy.cacheable) {
    for (const row of data) {
      writes.push(setCachedAsync(`eve-intel.cache.universe-name.${row.id}`, row.name, policy.ttlMs, policy.staleMs));
    }
  }
  if (writes.length > 0) {
    await Promise.all(writes);
  }

  return data;
}

async function refreshInventoryTypeIdByName(
  name: string,
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<number> {
  const normalized = name.trim().toLowerCase();
  const response = await fetchJsonWithMeta<EsiIdsResponse>(
    `${ESI_BASE}/universe/ids/?datasource=${DATASOURCE}&language=en`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([name])
    },
    undefined,
    signal,
    onRetry
  );
  const data = response.data;

  const exact = (data.inventory_types ?? []).find((row) => row.name.trim().toLowerCase() === normalized);
  const typeId = exact?.id ?? data.inventory_types?.[0]?.id ?? 0;
  const policy = resolveHttpCachePolicy(response.headers, {
    fallbackTtlMs: typeId > 0 ? TYPE_SEARCH_CACHE_TTL_MS : TYPE_SEARCH_MISS_TTL_MS,
    fallbackStaleMs: typeId > 0 ? TYPE_SEARCH_CACHE_TTL_MS : TYPE_SEARCH_MISS_TTL_MS,
    fetchedAt: response.fetchedAt
  });
  if (policy.cacheable) {
    await setCachedAsync(
      `eve-intel.cache.inventory-type.${normalized}`,
      typeId,
      policy.ttlMs,
      policy.staleMs
    );
  }
  return typeId;
}

function characterNameCacheKey(name: string): string {
  return `eve-intel.cache.name.${normalizeName(name)}`;
}

function characterNameMissCacheKey(name: string): string {
  return `eve-intel.cache.name-miss.${normalizeName(name)}`;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function characterIdsRequestKey(names: string[]): string {
  return names
    .map((name) => normalizeName(name))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function refreshCharacterIdsDeduped(
  names: string[],
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<EsiIdsResponse> {
  const requestKey = characterIdsRequestKey(names);
  const existing = characterIdsInFlight.get(requestKey);
  if (existing) {
    return existing;
  }

  const request = refreshCharacterIds(names, onRetry, signal).finally(() => {
    characterIdsInFlight.delete(requestKey);
  });
  characterIdsInFlight.set(requestKey, request);
  return request;
}

function refreshCharacterPublicDeduped(
  characterId: number,
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<CharacterPublic> {
  const existing = characterPublicInFlight.get(characterId);
  if (existing) {
    return existing;
  }

  const request = refreshCharacterPublic(characterId, onRetry, signal).finally(() => {
    characterPublicInFlight.delete(characterId);
  });
  characterPublicInFlight.set(characterId, request);
  return request;
}

function refreshInventoryTypeIdByNameDeduped(
  name: string,
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<number> {
  const normalized = normalizeName(name);
  const existing = inventoryTypeInFlight.get(normalized);
  if (existing) {
    return existing;
  }

  const request = refreshInventoryTypeIdByName(name, onRetry, signal).finally(() => {
    inventoryTypeInFlight.delete(normalized);
  });
  inventoryTypeInFlight.set(normalized, request);
  return request;
}
