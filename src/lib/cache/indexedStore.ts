import type { CacheEnvelope } from "./types";

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

export async function getIndexedEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const db = await getDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
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

export async function setIndexedEnvelope<T>(key: string, envelope: CacheEnvelope<T>): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ key, envelope } satisfies IndexedRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("indexedDB put failed"));
    });
  } catch {
    // Ignore IndexedDB failures; localStorage path already attempted.
  }
}

export async function removeIndexedEnvelope(key: string): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("indexedDB delete failed"));
    });
  } catch {
    // Ignore cleanup failures.
  }
}

export async function clearIndexedStore(): Promise<void> {
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
