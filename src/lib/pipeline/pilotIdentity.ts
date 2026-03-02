import type { ParsedPilotInput } from "../../types";
import type { ZkillKillmail } from "../api/zkill";
import type { PilotCard } from "../pilotDomain";

export function toPilotKey(pilotName: string): string {
  return pilotName.trim().toLowerCase();
}

export function normalizeShipName(ship: string | undefined): string {
  return ship?.trim().toLowerCase() ?? "";
}

export function buildEntrySignature(entry: ParsedPilotInput): string {
  return `${toPilotKey(entry.pilotName)}|${normalizeShipName(entry.explicitShip)}`;
}

export function killmailHeadSignature(rows: ZkillKillmail[]): string {
  return rows.slice(0, 200).map((row) => row.killmail_id).join(",");
}

export function shouldForceRefreshForExplicitMismatch(
  entry: ParsedPilotInput,
  predictedShips: PilotCard["predictedShips"] | undefined
): boolean {
  const explicit = normalizeShipName(entry.explicitShip);
  if (!explicit || !predictedShips || predictedShips.length === 0) {
    return false;
  }
  const topInferred = predictedShips.find((ship) => ship.source === "inferred");
  if (!topInferred) {
    return false;
  }
  return normalizeShipName(topInferred.shipName) !== explicit;
}
