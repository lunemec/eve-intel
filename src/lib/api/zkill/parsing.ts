import type { RetryInfo } from "../http";
import type { ZkillCharacterStats, ZkillKillmail, ZkillSummaryRow } from "./types";

type HydrateSummaries = (
  rows: ZkillSummaryRow[],
  signal?: AbortSignal,
  onRetry?: (info: RetryInfo) => void
) => Promise<ZkillKillmail[]>;

export async function parseZkillResponse(
  payload: unknown,
  params: {
    maxHydrate: number;
    signal?: AbortSignal;
    onRetry?: (info: RetryInfo) => void;
    findHydrationCandidates: (payload: unknown) => ZkillSummaryRow[];
    hydrateSummaries: HydrateSummaries;
  }
): Promise<ZkillKillmail[]> {
  if (!Array.isArray(payload)) {
    throw new Error(`Unexpected zKill payload (not array): ${formatPayloadSnippet(payload)}`);
  }

  const normalized = normalizeZkillArray(payload);
  if (normalized.length > 0) {
    const hydrationCandidates = params.findHydrationCandidates(payload);
    if (hydrationCandidates.length === 0) {
      return normalized;
    }

    const hydrated = await params.hydrateSummaries(
      hydrationCandidates.slice(0, params.maxHydrate),
      params.signal,
      params.onRetry
    );
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
    (entry): entry is ZkillSummaryRow =>
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

  return params.hydrateSummaries(summaryRows.slice(0, params.maxHydrate), params.signal, params.onRetry);
}

export function normalizeZkillArray(payload: unknown[]): ZkillKillmail[] {
  return payload.filter((entry): entry is ZkillKillmail => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const row = entry as Partial<ZkillKillmail>;
    return typeof row.killmail_id === "number" && typeof row.killmail_time === "string";
  });
}

export function parseCharacterStats(payload: unknown): ZkillCharacterStats | null {
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
  const dangerRatioRaw = extractNumber(root, ["danger", "dangerRatio"]);
  const legacyDangerRaw = extractNumber(root, ["dangerous", "dangerousRatio", "dangerous.value", "dangerous.all"]);
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
  const danger = normalizeDangerPercent(dangerRaw, {
    allowTenPointScale: dangerRatioRaw === undefined && legacyDangerRaw !== undefined
  });
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

function formatPayloadSnippet(payload: unknown): string {
  try {
    const raw = JSON.stringify(payload);
    return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
  } catch {
    return String(payload);
  }
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

function normalizeDangerPercent(
  value?: number,
  options?: { allowTenPointScale?: boolean }
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value < 1) {
    return Number((value * 100).toFixed(1));
  }
  if (options?.allowTenPointScale && value <= 10) {
    return Number((value * 10).toFixed(1));
  }
  return Number(value.toFixed(1));
}
