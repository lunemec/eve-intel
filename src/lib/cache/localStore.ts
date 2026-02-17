import { CACHE_PREFIX, type CacheEnvelope, type CacheLookup } from "./types";

export function versionedKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

export function buildEnvelope<T>(value: T, ttlMs: number, staleMs = Math.floor(ttlMs / 2)): CacheEnvelope<T> {
  const now = Date.now();
  return {
    writtenAt: now,
    staleAt: now + Math.max(1, staleMs),
    expiresAt: now + Math.max(1, ttlMs),
    value
  };
}

export function getLocalCachedState<T>(key: string): CacheLookup<T> {
  try {
    const raw = localStorage.getItem(versionedKey(key));
    if (!raw) {
      return { value: null, stale: false };
    }

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    const now = Date.now();
    if (now > parsed.expiresAt) {
      localStorage.removeItem(versionedKey(key));
      return { value: null, stale: false };
    }

    return {
      value: parsed.value,
      stale: now > parsed.staleAt
    };
  } catch {
    return { value: null, stale: false };
  }
}

export function setLocalCachedEnvelope<T>(
  key: string,
  envelope: CacheEnvelope<T>,
  maxItemBytes: number,
  maxTotalBytes: number
): boolean {
  const k = versionedKey(key);
  const serialized = JSON.stringify(envelope);
  if (serialized.length > maxItemBytes) {
    return false;
  }

  try {
    guardLocalStorageBudget(serialized.length, k, maxTotalBytes);
    localStorage.setItem(k, serialized);
    return true;
  } catch {
    try {
      evictOldest(15);
      localStorage.setItem(k, serialized);
      return true;
    } catch {
      return false;
    }
  }
}

export function clearLocalCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CACHE_PREFIX)) {
      continue;
    }
    keysToRemove.push(key);
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

function guardLocalStorageBudget(incomingBytes: number, key: string, maxTotalBytes: number): void {
  const usage = estimateLocalUsage();
  const existingBytes = localStorage.getItem(key)?.length ?? 0;
  const projected = usage - existingBytes + incomingBytes;

  if (projected > maxTotalBytes) {
    const bytesToFree = projected - maxTotalBytes;
    evictBytes(bytesToFree);
  }
}

function estimateLocalUsage(): number {
  let total = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CACHE_PREFIX)) {
      continue;
    }
    total += localStorage.getItem(key)?.length ?? 0;
  }
  return total;
}

function evictBytes(requiredBytes: number): void {
  const records = collectVersionedRecords();
  let freed = 0;
  for (const record of records) {
    localStorage.removeItem(record.key);
    freed += record.bytes;
    if (freed >= requiredBytes) {
      return;
    }
  }
}

function evictOldest(count: number): void {
  const records = collectVersionedRecords();
  for (const record of records.slice(0, count)) {
    localStorage.removeItem(record.key);
  }
}

function collectVersionedRecords(): Array<{ key: string; writtenAt: number; bytes: number }> {
  const records: Array<{ key: string; writtenAt: number; bytes: number }> = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CACHE_PREFIX)) {
      continue;
    }

    const raw = localStorage.getItem(key);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as CacheEnvelope<unknown>;
      records.push({ key, writtenAt: parsed.writtenAt ?? 0, bytes: raw.length });
    } catch {
      localStorage.removeItem(key);
    }
  }

  records.sort((a, b) => a.writtenAt - b.writtenAt);
  return records;
}
