import { getCachedStateAsync, setCachedAsync } from "./cache";

const DEV_FIT_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 365;
const DEV_FIT_INDEX_KEY = "eve-intel.dev-fit.index.v1";

export type DevFitRecord = {
  key: string;
  shipName: string;
  shipTypeId?: number;
  eft: string;
  sourceLossKillmailId?: number;
  firstSeenAt: string;
};

export async function persistDevFitRecord(record: {
  key?: string;
  shipName: string;
  shipTypeId?: number;
  eft: string;
  sourceLossKillmailId?: number;
  firstSeenAt?: string;
}): Promise<boolean> {
  const key = record.key ?? buildDevFitKey(record.shipName, record.eft);
  const recordKey = buildDevFitRecordKey(key);
  const existing = await getCachedStateAsync<DevFitRecord>(recordKey);
  if (existing.value) {
    return false;
  }

  const firstSeenAt = record.firstSeenAt ?? new Date().toISOString();
  const stored: DevFitRecord = {
    key,
    shipName: record.shipName.trim(),
    shipTypeId: record.shipTypeId,
    eft: normalizeEft(record.eft),
    sourceLossKillmailId: record.sourceLossKillmailId,
    firstSeenAt
  };
  await setCachedAsync(recordKey, stored, DEV_FIT_CACHE_TTL_MS);

  const indexState = await getCachedStateAsync<string[]>(DEV_FIT_INDEX_KEY);
  const current = Array.isArray(indexState.value) ? indexState.value : [];
  if (!current.includes(key)) {
    await setCachedAsync(DEV_FIT_INDEX_KEY, [...current, key], DEV_FIT_CACHE_TTL_MS);
  }
  await appendDesktopParityFitDump(stored);

  return true;
}

export function buildDevFitKey(shipName: string, eft: string): string {
  const normalizedShip = normalizeShipName(shipName);
  const normalizedEft = normalizeEft(eft);
  const payload = `${normalizedShip}\n${normalizedEft}`;
  return `fit-${fnv1aHex(payload)}`;
}

function buildDevFitRecordKey(key: string): string {
  return `eve-intel.dev-fit.record.${key}`;
}

function normalizeShipName(shipName: string): string {
  return shipName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeEft(eft: string): string {
  return eft
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function appendDesktopParityFitDump(record: DevFitRecord): Promise<void> {
  const append = window.eveIntelDesktop?.appendParityFitDump;
  if (!append) {
    return;
  }
  try {
    await append(record);
  } catch {
    // Best-effort desktop file sink; cache persistence already succeeded.
  }
}
