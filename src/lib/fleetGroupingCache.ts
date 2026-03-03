import { getCachedStateAsync, setCachedAsync } from "./cache";
import type { GroupPresentation } from "./appViewModel";
import type { ZkillKillmail } from "./api/zkill";
import type { PilotCard } from "./pilotDomain";

const FLEET_GROUPING_ARTIFACT_VERSION = 1;
const FLEET_GROUPING_CACHE_KEY_NAMESPACE = "v1";
const FLEET_GROUPING_ARTIFACT_SOURCE_NAMESPACE = "fleet-grouping-artifact-src-v1";
const FLEET_GROUPING_ARTIFACT_TTL_MS = 15 * 60 * 1000;
const FLEET_GROUPING_ARTIFACT_STALE_MS = 5 * 60 * 1000;

export type FleetGroupingCacheArtifact = {
  version: typeof FLEET_GROUPING_ARTIFACT_VERSION;
  selectedPilotIds: number[];
  sourceSignature: string;
  orderedPilotIds: number[];
  presentationEntries: Array<[number, GroupPresentation]>;
  savedAt: number;
};

export type FleetGroupingArtifactLoadResult = {
  artifact: FleetGroupingCacheArtifact | null;
  stale: boolean;
};

export function buildFleetGroupingArtifactKey(params: {
  selectedPilotIds: number[];
}): string {
  const selectedPilotIds = normalizePilotIds(params.selectedPilotIds);
  return `eve-intel.cache.fleet.grouping.${FLEET_GROUPING_CACHE_KEY_NAMESPACE}.${selectedPilotIds.join(",")}`;
}

export function buildFleetGroupingArtifactSourceSignature(pilotCards: PilotCard[]): string {
  const selectedPilotIds = normalizePilotIds(
    pilotCards
      .map((pilot) => toValidPilotId(pilot.characterId))
      .filter((pilotId): pilotId is number => pilotId !== null)
  );
  const byPilotId = collectPilotCardsById(pilotCards);
  const cardFragments = selectedPilotIds.map((pilotId) => {
    const pilot = byPilotId.get(pilotId);
    const killIds = normalizeKillmailIds(pilot?.inferenceKills ?? []);
    const lossIds = normalizeKillmailIds(pilot?.inferenceLosses ?? []);
    return `${pilotId}:k${killIds.join(",")}:l${lossIds.join(",")}`;
  });

  return [
    FLEET_GROUPING_ARTIFACT_SOURCE_NAMESPACE,
    `selected:${selectedPilotIds.join(",")}`,
    `cards:${cardFragments.join("|")}`
  ].join("|");
}

export async function loadFleetGroupingArtifact(params: {
  selectedPilotIds: number[];
}): Promise<FleetGroupingArtifactLoadResult> {
  const key = buildFleetGroupingArtifactKey(params);
  const cached = await getCachedStateAsync<FleetGroupingCacheArtifact>(key);
  return {
    artifact: cached.value,
    stale: cached.stale
  };
}

export async function saveFleetGroupingArtifact(params: {
  selectedPilotIds: number[];
  sourceSignature: string;
  orderedPilotIds: number[];
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>;
}): Promise<void> {
  const key = buildFleetGroupingArtifactKey(params);
  const artifact: FleetGroupingCacheArtifact = {
    version: FLEET_GROUPING_ARTIFACT_VERSION,
    selectedPilotIds: normalizePilotIds(params.selectedPilotIds),
    sourceSignature: params.sourceSignature,
    orderedPilotIds: normalizeOrderedPilotIds(params.orderedPilotIds),
    presentationEntries: normalizePresentationEntries(params.groupPresentationByPilotId),
    savedAt: Date.now()
  };
  await setCachedAsync(key, artifact, FLEET_GROUPING_ARTIFACT_TTL_MS, FLEET_GROUPING_ARTIFACT_STALE_MS);
}

export function isFleetGroupingArtifactUsable(
  artifact: FleetGroupingCacheArtifact | null,
  params: {
    selectedPilotIds: number[];
    sourceSignature: string;
  }
): artifact is FleetGroupingCacheArtifact {
  if (!artifact) {
    return false;
  }
  if (artifact.version !== FLEET_GROUPING_ARTIFACT_VERSION) {
    return false;
  }
  if (artifact.sourceSignature !== params.sourceSignature) {
    return false;
  }
  const expectedSelectedPilotIds = normalizePilotIds(params.selectedPilotIds);
  if (!arrayEquals(artifact.selectedPilotIds, expectedSelectedPilotIds)) {
    return false;
  }
  return true;
}

export function materializeGroupPresentationByPilotId(
  presentationEntries: FleetGroupingCacheArtifact["presentationEntries"]
): ReadonlyMap<number, GroupPresentation> {
  if (presentationEntries.length === 0) {
    return new Map();
  }
  const byPilotId = new Map<number, GroupPresentation>();
  for (const [pilotId, presentation] of presentationEntries) {
    const normalizedPilotId = toValidPilotId(pilotId);
    if (normalizedPilotId === null || byPilotId.has(normalizedPilotId)) {
      continue;
    }
    byPilotId.set(normalizedPilotId, normalizeGroupPresentation(presentation));
  }
  return byPilotId;
}

function collectPilotCardsById(pilotCards: PilotCard[]): Map<number, PilotCard> {
  const byPilotId = new Map<number, PilotCard>();
  for (const pilot of pilotCards) {
    const pilotId = toValidPilotId(pilot.characterId);
    if (pilotId === null || byPilotId.has(pilotId)) {
      continue;
    }
    byPilotId.set(pilotId, pilot);
  }
  return byPilotId;
}

function normalizeKillmailIds(rows: ZkillKillmail[]): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    const killmailId = row.killmail_id;
    if (Number.isInteger(killmailId) && killmailId > 0) {
      ids.add(killmailId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function normalizePilotIds(pilotIds: number[]): number[] {
  const ids = new Set<number>();
  for (const pilotId of pilotIds) {
    if (Number.isInteger(pilotId) && pilotId > 0) {
      ids.add(pilotId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function normalizeOrderedPilotIds(pilotIds: number[]): number[] {
  const normalized: number[] = [];
  const included = new Set<number>();
  for (const pilotId of pilotIds) {
    if (!Number.isInteger(pilotId) || pilotId <= 0 || included.has(pilotId)) {
      continue;
    }
    normalized.push(pilotId);
    included.add(pilotId);
  }
  return normalized;
}

function normalizePresentationEntries(
  groupPresentationByPilotId: ReadonlyMap<number, GroupPresentation>
): Array<[number, GroupPresentation]> {
  const entries: Array<[number, GroupPresentation]> = [];
  for (const [pilotId, presentation] of groupPresentationByPilotId) {
    const normalizedPilotId = toValidPilotId(pilotId);
    if (normalizedPilotId === null) {
      continue;
    }
    entries.push([normalizedPilotId, normalizeGroupPresentation(presentation)]);
  }
  return entries.sort((left, right) => left[0] - right[0]);
}

function normalizeGroupPresentation(presentation: GroupPresentation): GroupPresentation {
  const groupId = normalizeOptionalString(presentation.groupId);
  const groupColorToken = normalizeOptionalString(presentation.groupColorToken);
  const suggestionStrongestRatio = normalizeOptionalRatio(presentation.suggestionStrongestRatio);
  const suggestionStrongestSharedKillCount = normalizeOptionalPositiveInteger(
    presentation.suggestionStrongestSharedKillCount
  );
  const suggestionStrongestWindowKillCount = normalizeOptionalPositiveInteger(
    presentation.suggestionStrongestWindowKillCount
  );
  const suggestionStrongestSourcePilotId = normalizeOptionalPositiveInteger(
    presentation.suggestionStrongestSourcePilotId
  );
  const suggestionStrongestSourcePilotName = normalizeOptionalString(
    presentation.suggestionStrongestSourcePilotName
  );
  return {
    ...(groupId ? { groupId } : {}),
    ...(groupColorToken ? { groupColorToken } : {}),
    isGreyedSuggestion: Boolean(presentation.isGreyedSuggestion),
    isUngrouped: Boolean(presentation.isUngrouped),
    ...(suggestionStrongestRatio !== undefined ? { suggestionStrongestRatio } : {}),
    ...(suggestionStrongestSharedKillCount !== undefined ? { suggestionStrongestSharedKillCount } : {}),
    ...(suggestionStrongestWindowKillCount !== undefined ? { suggestionStrongestWindowKillCount } : {}),
    ...(suggestionStrongestSourcePilotId !== undefined ? { suggestionStrongestSourcePilotId } : {}),
    ...(suggestionStrongestSourcePilotName ? { suggestionStrongestSourcePilotName } : {})
  };
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalRatio(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  if (value < 0 || value > 1) {
    return undefined;
  }
  return value;
}

function normalizeOptionalPositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function toValidPilotId(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function arrayEquals(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
