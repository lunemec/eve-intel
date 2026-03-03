import type { PilotCard } from "./pilotDomain";

export const FLEET_GROUPING_VERSION = 1 as const;
export const CO_FLY_RATIO_THRESHOLD = 0.8;
export const CO_FLY_SHARED_KILL_THRESHOLD = 10;

export type CoFlyEvidence = {
  anchorPilotId: number;
  candidatePilotId: number;
  sharedKillCount: number;
  evaluatedKillCount: number;
  ratio: number;
};

export type SuggestedPilot = {
  characterId: number;
  name: string;
  sourcePilotIds: number[];
  strongestRatio: number;
  strongestSharedKillCount: number;
  eligible: boolean;
};

export type FleetGroup = {
  groupId: string;
  memberPilotIds: number[];
  selectedPilotIds: number[];
  suggestedPilotIds: number[];
  weightedConfidence: number;
  colorIndex: number;
};

export type FleetGroupingState = {
  version: typeof FLEET_GROUPING_VERSION;
  groups: FleetGroup[];
  suggestions: SuggestedPilot[];
  orderedPilotIds: number[];
  generatedAtMs: number;
  sourceSignature: string;
};

export type FleetGroupingInput = {
  selectedPilotIds: number[];
  pilotCardsById: Map<number, PilotCard>;
  allKnownPilotNamesById: Map<number, string>;
  previousState?: FleetGroupingState;
  nowMs: number;
};

export type FleetGroupingOutput = {
  state: FleetGroupingState;
  orderedPilotIds: number[];
  groups: FleetGroup[];
  suggestions: SuggestedPilot[];
};

export function createEmptyFleetGroupingState(params: {
  generatedAtMs: number;
  sourceSignature: string;
}): FleetGroupingState {
  return {
    version: FLEET_GROUPING_VERSION,
    groups: [],
    suggestions: [],
    orderedPilotIds: [],
    generatedAtMs: params.generatedAtMs,
    sourceSignature: params.sourceSignature
  };
}

export function buildFleetGroupingSourceSignature(selectedPilotIds: number[]): string {
  const normalizedIds = normalizePilotIds(selectedPilotIds);
  return `fleet-grouping-v1|selected:${normalizedIds.join(",")}`;
}

export function stableFleetGroupId(memberPilotIds: number[]): string {
  const normalizedIds = normalizePilotIds(memberPilotIds);
  const signature = normalizedIds.join(",");
  return `fleet-group-v1-${stableHashHex(signature)}`;
}

export function computeFleetGrouping(input: FleetGroupingInput): FleetGroupingOutput {
  const selectedPilotIds = normalizePilotIds(input.selectedPilotIds);
  const sourceSignature = buildFleetGroupingSourceSignature(selectedPilotIds);
  const coFlyEvidence = extractCoFlyEvidence({
    selectedPilotIds,
    pilotCardsById: input.pilotCardsById
  });
  const internalSuggestions = buildSuggestedPilots({
    coFlyEvidence,
    allKnownPilotNamesById: input.allKnownPilotNamesById,
    pilotCardsById: input.pilotCardsById
  });
  const visibleSuggestions = internalSuggestions.filter((suggestion) => suggestion.eligible);

  const state = createEmptyFleetGroupingState({
    generatedAtMs: input.nowMs,
    sourceSignature
  });
  state.suggestions = internalSuggestions;

  return {
    state,
    orderedPilotIds: [],
    groups: [],
    suggestions: visibleSuggestions
  };
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

function stableHashHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function extractCoFlyEvidence(params: {
  selectedPilotIds: number[];
  pilotCardsById: Map<number, PilotCard>;
}): CoFlyEvidence[] {
  const coFlyEvidence: CoFlyEvidence[] = [];

  for (const anchorPilotId of params.selectedPilotIds) {
    const inferenceKills = params.pilotCardsById.get(anchorPilotId)?.inferenceKills ?? [];
    if (inferenceKills.length === 0) {
      continue;
    }

    const sharedKillCountByCandidateId = new Map<number, number>();
    for (const killmail of inferenceKills) {
      const uniqueCandidateIds = new Set<number>();
      for (const attacker of killmail.attackers ?? []) {
        const candidateId = attacker.character_id;
        if (typeof candidateId !== "number" || !Number.isInteger(candidateId) || candidateId <= 0 || candidateId === anchorPilotId) {
          continue;
        }
        uniqueCandidateIds.add(candidateId);
      }

      for (const candidateId of uniqueCandidateIds) {
        sharedKillCountByCandidateId.set(candidateId, (sharedKillCountByCandidateId.get(candidateId) ?? 0) + 1);
      }
    }

    for (const [candidatePilotId, sharedKillCount] of sharedKillCountByCandidateId) {
      coFlyEvidence.push({
        anchorPilotId,
        candidatePilotId,
        sharedKillCount,
        evaluatedKillCount: inferenceKills.length,
        ratio: sharedKillCount / inferenceKills.length
      });
    }
  }

  return coFlyEvidence.sort(
    (left, right) =>
      left.anchorPilotId - right.anchorPilotId ||
      left.candidatePilotId - right.candidatePilotId
  );
}

function buildSuggestedPilots(params: {
  coFlyEvidence: CoFlyEvidence[];
  allKnownPilotNamesById: Map<number, string>;
  pilotCardsById: Map<number, PilotCard>;
}): SuggestedPilot[] {
  const suggestionsByCharacterId = new Map<
    number,
    {
      characterId: number;
      name: string;
      sourcePilotIds: Set<number>;
      strongestRatio: number;
      strongestSharedKillCount: number;
      eligible: boolean;
    }
  >();

  for (const evidence of params.coFlyEvidence) {
    let suggestion = suggestionsByCharacterId.get(evidence.candidatePilotId);
    if (!suggestion) {
      suggestion = {
        characterId: evidence.candidatePilotId,
        name: resolveSuggestedPilotName({
          characterId: evidence.candidatePilotId,
          allKnownPilotNamesById: params.allKnownPilotNamesById,
          pilotCardsById: params.pilotCardsById
        }),
        sourcePilotIds: new Set<number>(),
        strongestRatio: evidence.ratio,
        strongestSharedKillCount: evidence.sharedKillCount,
        eligible: false
      };
      suggestionsByCharacterId.set(evidence.candidatePilotId, suggestion);
    }

    suggestion.sourcePilotIds.add(evidence.anchorPilotId);
    if (
      evidence.ratio > suggestion.strongestRatio ||
      (evidence.ratio === suggestion.strongestRatio && evidence.sharedKillCount > suggestion.strongestSharedKillCount)
    ) {
      suggestion.strongestRatio = evidence.ratio;
      suggestion.strongestSharedKillCount = evidence.sharedKillCount;
    }
    if (meetsSuggestionVisibilityThreshold(evidence)) {
      suggestion.eligible = true;
    }
  }

  return [...suggestionsByCharacterId.values()]
    .map((suggestion) => ({
      characterId: suggestion.characterId,
      name: suggestion.name,
      sourcePilotIds: [...suggestion.sourcePilotIds].sort((a, b) => a - b),
      strongestRatio: suggestion.strongestRatio,
      strongestSharedKillCount: suggestion.strongestSharedKillCount,
      eligible: suggestion.eligible
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }) || left.characterId - right.characterId);
}

function resolveSuggestedPilotName(params: {
  characterId: number;
  allKnownPilotNamesById: Map<number, string>;
  pilotCardsById: Map<number, PilotCard>;
}): string {
  const knownName = params.allKnownPilotNamesById.get(params.characterId);
  if (knownName && knownName.trim().length > 0) {
    return knownName;
  }

  const pilotCardName = params.pilotCardsById.get(params.characterId)?.characterName;
  if (pilotCardName && pilotCardName.trim().length > 0) {
    return pilotCardName;
  }

  return `Character ${params.characterId}`;
}

function meetsSuggestionVisibilityThreshold(evidence: CoFlyEvidence): boolean {
  return evidence.ratio > CO_FLY_RATIO_THRESHOLD && evidence.sharedKillCount >= CO_FLY_SHARED_KILL_THRESHOLD;
}
