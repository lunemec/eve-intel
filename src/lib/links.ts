const ZKILL_BASE = "https://zkillboard.com";
const EVE_IMAGE_BASE = "https://images.evetech.net";
const DEFAULT_UNKNOWN_SHIP_TYPE_ID = 587;

export function characterZkillUrl(characterId: number): string {
  return `${ZKILL_BASE}/character/${characterId}/`;
}

export function corporationZkillUrl(corporationId: number): string {
  return `${ZKILL_BASE}/corporation/${corporationId}/`;
}

export function allianceZkillUrl(allianceId: number): string {
  return `${ZKILL_BASE}/alliance/${allianceId}/`;
}

export function killmailZkillUrl(killmailId: number): string {
  return `${ZKILL_BASE}/kill/${killmailId}/`;
}

export function characterPortraitUrl(characterId: number, size = 64): string {
  return `${EVE_IMAGE_BASE}/characters/${characterId}/portrait?size=${size}`;
}

export function corporationLogoUrl(corporationId: number, size = 64): string {
  return `${EVE_IMAGE_BASE}/corporations/${corporationId}/logo?size=${size}`;
}

export function allianceLogoUrl(allianceId: number, size = 64): string {
  return `${EVE_IMAGE_BASE}/alliances/${allianceId}/logo?size=${size}`;
}

export function shipIconUrl(typeId: number | undefined, size = 64, fallbackTypeId = DEFAULT_UNKNOWN_SHIP_TYPE_ID): string {
  const resolvedTypeId = typeId && Number.isFinite(typeId) && typeId > 0 ? typeId : fallbackTypeId;
  return `${EVE_IMAGE_BASE}/types/${resolvedTypeId}/icon?size=${size}`;
}
