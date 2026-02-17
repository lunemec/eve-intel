import type { ZkillKillmail } from "../api/zkill";

export type Evidence = {
  shipTypeId: number;
  occurredAt: number;
  eventType: "kill" | "loss";
};

export function collectEvidence(characterId: number, kills: ZkillKillmail[], losses: ZkillKillmail[]): Evidence[] {
  const evidence: Evidence[] = [];

  for (const kill of kills) {
    const attacker = kill.attackers?.find((entry) => entry.character_id === characterId);
    if (attacker?.ship_type_id) {
      evidence.push({
        shipTypeId: attacker.ship_type_id,
        occurredAt: Date.parse(kill.killmail_time),
        eventType: "kill"
      });
    }
  }

  for (const loss of losses) {
    // zKill list payloads can omit victim.character_id even on character-scoped endpoints.
    // Since this list is already filtered by character ID upstream, treat missing victim ID as a match.
    if ((loss.victim.character_id === characterId || loss.victim.character_id === undefined) && loss.victim.ship_type_id) {
      evidence.push({
        shipTypeId: loss.victim.ship_type_id,
        occurredAt: Date.parse(loss.killmail_time),
        eventType: "loss"
      });
    }
  }

  return evidence;
}
