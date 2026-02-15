type CacheEnvelope<T> = {
  writtenAt: number;
  staleAt: number;
  expiresAt: number;
  value: T;
};

export type CacheLookup<T> = {
  value: T | null;
  stale: boolean;
};

const CACHE_VERSION = "v3";
const CACHE_PREFIX = `eve-intel.${CACHE_VERSION}.`;
const MAX_LOCAL_ITEM_BYTES = 250_000;
const MAX_LOCAL_TOTAL_BYTES = 4_500_000;

export function getCached<T>(key: string): T | null {
  return getCachedState<T>(key).value;
}

export function getCachedState<T>(key: string): CacheLookup<T> {
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

export function setCached<T>(key: string, value: T, ttlMs: number, staleMs = Math.floor(ttlMs / 2)): void {
  const now = Date.now();
  const payload: CacheEnvelope<T> = {
    writtenAt: now,
    staleAt: now + Math.max(1, staleMs),
    expiresAt: now + Math.max(1, ttlMs),
    value
  };

  const k = versionedKey(key);
  const serialized = JSON.stringify(payload);

  if (serialized.length > MAX_LOCAL_ITEM_BYTES) {
    void setIndexedCached(key, payload);
    return;
  }

  try {
    guardLocalStorageBudget(serialized.length, k);
    localStorage.setItem(k, serialized);
  } catch {
    try {
      evictOldest(15);
      localStorage.setItem(k, serialized);
    } catch {
      // Fall through to IndexedDB-only cache path.
    }
  }

  void setIndexedCached(key, payload);
}

export async function getCachedStateAsync<T>(key: string): Promise<CacheLookup<T>> {
  const local = getCachedState<T>(key);
  if (local.value !== null) {
    return local;
  }

  const indexed = await getIndexedCached<T>(key);
  if (!indexed) {
    return { value: null, stale: false };
  }

  const now = Date.now();
  if (now > indexed.expiresAt) {
    await removeIndexedCache(key);
    return { value: null, stale: false };
  }

  setCached(key, indexed.value, indexed.expiresAt - now, indexed.staleAt - now);

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
  } catch {
    // Ignore localStorage clear failures.
  }

  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("indexedDB clear failed"));
    });
  } catch {
    // Ignore IndexedDB clear failures.
  }
}

function versionedKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

function guardLocalStorageBudget(incomingBytes: number, key: string): void {
  const usage = estimateLocalUsage();
  const existingBytes = localStorage.getItem(key)?.length ?? 0;
  const projected = usage - existingBytes + incomingBytes;

  if (projected > MAX_LOCAL_TOTAL_BYTES) {
    const bytesToFree = projected - MAX_LOCAL_TOTAL_BYTES;
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

type IndexedRecord = {
  key: string;
  envelope: CacheEnvelope<unknown>;
};

const DB_NAME = "eve-intel-cache";
const STORE_NAME = "entries";
let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
  });

  return dbPromise;
}

async function getIndexedCached<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const db = await getDb();
    const k = versionedKey(key);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(k);
      request.onsuccess = () => {
        const row = request.result as IndexedRecord | undefined;
        resolve((row?.envelope as CacheEnvelope<T> | undefined) ?? null);
      };
      request.onerror = () => reject(request.error ?? new Error("indexedDB get failed"));
    });
  } catch {
    return null;
  }
}

async function setIndexedCached<T>(key: string, envelope: CacheEnvelope<T>): Promise<void> {
  try {
    const db = await getDb();
    const k = versionedKey(key);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ key: k, envelope } satisfies IndexedRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("indexedDB put failed"));
    });
  } catch {
    // Ignore IndexedDB failures; localStorage path already attempted.
  }
}

async function removeIndexedCache(key: string): Promise<void> {
  try {
    const db = await getDb();
    const k = versionedKey(key);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(k);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("indexedDB delete failed"));
    });
  } catch {
    // Ignore cleanup failures.
  }
}
