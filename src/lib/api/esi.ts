import { getCachedState, getCachedStateAsync, setCached, setCachedAsync } from "../cache";
import { fetchJson, type RetryInfo } from "./http";

const ESI_BASE = "https://esi.evetech.net/latest";
const DATASOURCE = "tranquility";
const NAME_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const CHARACTER_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const TYPE_SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const TYPE_SEARCH_MISS_TTL_MS = 1000 * 60 * 60 * 6;
const UNIVERSE_NAMES_BATCH_SIZE = 900;

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
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  const toFetch: string[] = [];

  for (const name of unique) {
    const cacheKey = characterNameCacheKey(name);
    const cached = getCachedState<number>(cacheKey);
    if (cached.value) {
      map.set(name.toLowerCase(), cached.value);
      if (cached.stale) {
        toFetch.push(name);
      }
    } else {
      toFetch.push(name);
    }
  }

  if (toFetch.length === 0) {
    return map;
  }

  if (toFetch.length > 0 && map.size === unique.length) {
    void refreshCharacterIds(toFetch, onRetry);
    return map;
  }

  const data = await refreshCharacterIds(toFetch, onRetry, signal);
  for (const character of data.characters ?? []) {
    map.set(character.name.toLowerCase(), character.id);
    setCached(characterNameCacheKey(character.name), character.id, NAME_CACHE_TTL_MS);
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
      void refreshCharacterPublic(characterId, onRetry);
    }
    return cached.value;
  }

  return refreshCharacterPublic(characterId, onRetry, signal);
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
        setCached(`eve-intel.cache.universe-name.${row.id}`, row.name, NAME_CACHE_TTL_MS);
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
      void refreshInventoryTypeIdByName(name, onRetry);
    }
    return cached.value > 0 ? cached.value : undefined;
  }

  const resolved = await refreshInventoryTypeIdByName(name, onRetry, signal);
  return resolved > 0 ? resolved : undefined;
}

async function refreshCharacterIds(
  names: string[],
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<EsiIdsResponse> {
  const data = await fetchJson<EsiIdsResponse>(
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

  for (const character of data.characters ?? []) {
    await setCachedAsync(characterNameCacheKey(character.name), character.id, NAME_CACHE_TTL_MS);
  }

  return data;
}

async function refreshCharacterPublic(
  characterId: number,
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<CharacterPublic> {
  const data = await fetchJson<CharacterPublic>(
    `${ESI_BASE}/characters/${characterId}/?datasource=${DATASOURCE}`,
    undefined,
    undefined,
    signal,
    onRetry
  );
  await setCachedAsync(`eve-intel.cache.character.${characterId}`, data, CHARACTER_CACHE_TTL_MS);
  return data;
}

async function refreshUniverseNames(
  ids: number[],
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<EsiNameResponse> {
  const data = await fetchJson<EsiNameResponse>(
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

  for (const row of data) {
    await setCachedAsync(`eve-intel.cache.universe-name.${row.id}`, row.name, NAME_CACHE_TTL_MS);
  }

  return data;
}

async function refreshInventoryTypeIdByName(
  name: string,
  onRetry?: (info: RetryInfo) => void,
  signal?: AbortSignal
): Promise<number> {
  const normalized = name.trim().toLowerCase();
  const data = await fetchJson<EsiIdsResponse>(
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

  const exact = (data.inventory_types ?? []).find((row) => row.name.trim().toLowerCase() === normalized);
  const typeId = exact?.id ?? data.inventory_types?.[0]?.id ?? 0;
  await setCachedAsync(
    `eve-intel.cache.inventory-type.${normalized}`,
    typeId,
    typeId > 0 ? TYPE_SEARCH_CACHE_TTL_MS : TYPE_SEARCH_MISS_TTL_MS
  );
  return typeId;
}

function characterNameCacheKey(name: string): string {
  return `eve-intel.cache.name.${name.toLowerCase()}`;
}
