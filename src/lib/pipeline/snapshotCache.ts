import { getCachedStateAsync, setCachedAsync } from "../cache";
import type { PilotCard } from "../usePilotIntelPipeline";
import type { PilotProcessedSnapshot } from "./types";

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;
const SNAPSHOT_STALE_MS = 5 * 60 * 1000;

export type SnapshotLoadResult = {
  snapshot: PilotProcessedSnapshot | null;
  stale: boolean;
};

export async function loadPilotSnapshot(params: {
  pilotName: string;
  characterId: number;
  lookbackDays: number;
}): Promise<SnapshotLoadResult> {
  const key = buildPilotSnapshotKey(params);
  const cached = await getCachedStateAsync<PilotProcessedSnapshot>(key);
  return {
    snapshot: cached.value,
    stale: cached.stale
  };
}

export async function savePilotSnapshot(params: {
  pilotName: string;
  characterId: number;
  lookbackDays: number;
  baseRow: PilotProcessedSnapshot["baseRow"];
  inferenceKills: PilotProcessedSnapshot["inferenceKills"];
  inferenceLosses: PilotProcessedSnapshot["inferenceLosses"];
  predictedShips: PilotProcessedSnapshot["predictedShips"];
  fitCandidates: PilotProcessedSnapshot["fitCandidates"];
  cynoRisk: PilotProcessedSnapshot["cynoRisk"];
  sourceSignature: string;
}): Promise<void> {
  const key = buildPilotSnapshotKey(params);
  const snapshot: PilotProcessedSnapshot = {
    version: SNAPSHOT_VERSION,
    pilotKey: normalizePilotName(params.pilotName),
    characterId: params.characterId,
    lookbackDays: params.lookbackDays,
    baseRow: params.baseRow,
    inferenceKills: params.inferenceKills,
    inferenceLosses: params.inferenceLosses,
    predictedShips: params.predictedShips,
    fitCandidates: params.fitCandidates,
    cynoRisk: params.cynoRisk,
    sourceSignature: params.sourceSignature,
    savedAt: Date.now()
  };
  await setCachedAsync(key, snapshot, SNAPSHOT_TTL_MS, SNAPSHOT_STALE_MS);
}

function buildPilotSnapshotKey(params: {
  pilotName: string;
  characterId: number;
  lookbackDays: number;
}): string {
  return `eve-intel.cache.pipeline.snapshot.v1.${params.characterId}.${params.lookbackDays}.${normalizePilotName(params.pilotName)}`;
}

export function buildPilotSnapshotSourceSignature(params: {
  row: Pick<PilotCard, "parsedEntry" | "inferenceKills" | "inferenceLosses">;
  lookbackDays: number;
  topShips: number;
}): string {
  const killIds = params.row.inferenceKills.map((row) => row.killmail_id).join(",");
  const lossIds = params.row.inferenceLosses.map((row) => row.killmail_id).join(",");
  const explicitShip = params.row.parsedEntry.explicitShip?.trim().toLowerCase() ?? "";
  return [
    "snapshot-src-v1",
    explicitShip,
    params.lookbackDays,
    params.topShips,
    killIds,
    lossIds
  ].join("|");
}

export function isPilotSnapshotUsable(
  snapshot: PilotProcessedSnapshot | null,
  params: {
    pilotName: string;
    characterId: number;
    lookbackDays: number;
    sourceSignature: string;
  }
): snapshot is PilotProcessedSnapshot {
  if (!snapshot) {
    return false;
  }
  if (snapshot.version !== SNAPSHOT_VERSION) {
    return false;
  }
  if (snapshot.pilotKey !== normalizePilotName(params.pilotName)) {
    return false;
  }
  if (snapshot.characterId !== params.characterId) {
    return false;
  }
  if (snapshot.lookbackDays !== params.lookbackDays) {
    return false;
  }
  if (snapshot.sourceSignature !== params.sourceSignature) {
    return false;
  }
  return true;
}

function normalizePilotName(value: string): string {
  return value.trim().toLowerCase();
}
