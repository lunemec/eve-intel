import type { PilotStats, ShipPrediction } from "../intel";
import type { ZkillCharacterStats, ZkillKillmail } from "../api/zkill";

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function mergeKillmailLists(primary: ZkillKillmail[], secondary: ZkillKillmail[]): ZkillKillmail[] {
  const map = new Map<number, ZkillKillmail>();
  for (const row of [...primary, ...secondary]) {
    map.set(row.killmail_id, row);
  }
  return [...map.values()].sort((a, b) => Date.parse(b.killmail_time) - Date.parse(a.killmail_time));
}

export function buildDerivedInferenceKey(params: {
  characterId: number;
  lookbackDays: number;
  topShips: number;
  explicitShip?: string;
  kills: ZkillKillmail[];
  losses: ZkillKillmail[];
}): string {
  const killHead = params.kills.slice(0, 8).map((k) => k.killmail_id).join(",");
  const killTail = params.kills.slice(-8).map((k) => k.killmail_id).join(",");
  const lossHead = params.losses.slice(0, 8).map((l) => l.killmail_id).join(",");
  const lossTail = params.losses.slice(-8).map((l) => l.killmail_id).join(",");
  return [
    "derived.inference.v8",
    params.characterId,
    params.lookbackDays,
    params.topShips,
    params.explicitShip ?? "-",
    params.kills.length,
    params.losses.length,
    killHead,
    killTail,
    lossHead,
    lossTail
  ].join("|");
}

export function isDerivedInferenceUsable(
  value: {
    predictedShips: ShipPrediction[];
    fitCandidates: unknown[];
    cynoRisk: unknown;
  } | null,
  explicitShip?: string
): boolean {
  if (!value || !Array.isArray(value.predictedShips) || !Array.isArray(value.fitCandidates) || !value.cynoRisk) {
    return false;
  }
  if (!explicitShip) {
    return true;
  }
  return value.predictedShips.some((ship) => ship.shipName === explicitShip);
}

export function mergePilotStats(params: {
  derived: PilotStats;
  zkillStats: ZkillCharacterStats | null;
}): PilotStats {
  const source = params.zkillStats;
  if (!source) {
    return params.derived;
  }

  const kills = source.kills ?? params.derived.kills;
  const losses = source.losses ?? params.derived.losses;
  const solo = source.solo ?? params.derived.solo;
  const avgGangSize = source.avgGangSize ?? params.derived.avgGangSize;
  const iskDestroyed = source.iskDestroyed ?? params.derived.iskDestroyed;
  const iskLost = source.iskLost ?? params.derived.iskLost;
  const zkillDanger = source.danger;
  const soloRatio = kills > 0 ? Number(((solo / kills) * 100).toFixed(1)) : 0;
  const gangRatio = Number.isFinite(source.gangRatio)
    ? Number(Math.max(0, Math.min(100, source.gangRatio ?? 0)).toFixed(1))
    : Number((100 - soloRatio).toFixed(1));
  const danger =
    typeof zkillDanger === "number" && Number.isFinite(zkillDanger)
      ? Number(zkillDanger.toFixed(1))
      : (kills + losses > 0 ? Number(((kills / (kills + losses)) * 100).toFixed(1)) : params.derived.danger);

  return {
    kills,
    losses,
    solo,
    soloRatio,
    avgGangSize,
    gangRatio,
    iskDestroyed,
    iskLost,
    kdRatio: losses > 0 ? Number((kills / losses).toFixed(2)) : kills > 0 ? kills : 0,
    iskRatio: iskLost > 0 ? Number((iskDestroyed / iskLost).toFixed(2)) : iskDestroyed > 0 ? iskDestroyed : 0,
    danger
  };
}
