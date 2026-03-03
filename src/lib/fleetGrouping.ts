import type { PilotCard } from "./pilotDomain";

export const FLEET_GROUPING_VERSION = 1 as const;
export const CO_FLY_RATIO_THRESHOLD = 0.8;
export const CO_FLY_SHARED_KILL_THRESHOLD = 10;
export const FLEET_GROUP_PALETTE_SIZE = 6;
const DEFAULT_PER_SELECTED_SUGGESTION_CAP = 3;
const ADAPTIVE_PER_SELECTED_SUGGESTION_CAPS = [DEFAULT_PER_SELECTED_SUGGESTION_CAP, 2, 1] as const;
const GLOBAL_SUGGESTION_CAP = 10;

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

export function stableFleetGroupColorIndex(groupId: string, paletteSize = FLEET_GROUP_PALETTE_SIZE): number {
  const normalizedPaletteSize = Number.isInteger(paletteSize) && paletteSize > 0 ? paletteSize : 1;
  const suffixMatch = /([0-9a-f]{8})$/i.exec(groupId);
  const parsedHash = suffixMatch ? Number.parseInt(suffixMatch[1], 16) : Number.parseInt(stableHashHex(groupId), 16);
  if (!Number.isInteger(parsedHash) || parsedHash < 0) {
    return 0;
  }
  return parsedHash % normalizedPaletteSize;
}

export function computeFleetGrouping(input: FleetGroupingInput): FleetGroupingOutput {
  const selectedPilotIds = normalizePilotIds(input.selectedPilotIds);
  const selectedPilotIdSet = new Set(selectedPilotIds);
  const sourceSignature = buildFleetGroupingSourceSignature(selectedPilotIds);
  const coFlyEvidence = extractCoFlyEvidence({
    selectedPilotIds,
    pilotCardsById: input.pilotCardsById
  });
  const internalSuggestions = buildSuggestedPilots({
    coFlyEvidence,
    selectedPilotIdSet,
    allKnownPilotNamesById: input.allKnownPilotNamesById,
    pilotCardsById: input.pilotCardsById
  });
  const visibleSuggestions = buildVisibleSuggestions({
    selectedPilotIds,
    selectedPilotIdSet,
    coFlyEvidence,
    allKnownPilotNamesById: input.allKnownPilotNamesById,
    pilotCardsById: input.pilotCardsById
  });
  const groupedOutput = buildFleetGroups({
    selectedPilotIds,
    selectedPilotIdSet,
    coFlyEvidence,
    visibleSuggestions,
    allKnownPilotNamesById: input.allKnownPilotNamesById,
    pilotCardsById: input.pilotCardsById
  });

  const state = createEmptyFleetGroupingState({
    generatedAtMs: input.nowMs,
    sourceSignature
  });
  state.suggestions = internalSuggestions;
  state.groups = groupedOutput.groups;
  state.orderedPilotIds = groupedOutput.orderedPilotIds;

  return {
    state,
    orderedPilotIds: groupedOutput.orderedPilotIds,
    groups: groupedOutput.groups,
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
  selectedPilotIdSet: Set<number>;
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
    if (params.selectedPilotIdSet.has(evidence.candidatePilotId)) {
      continue;
    }

    let suggestion = suggestionsByCharacterId.get(evidence.candidatePilotId);
    if (!suggestion) {
      suggestion = {
        characterId: evidence.candidatePilotId,
        name: resolvePilotName({
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

function buildVisibleSuggestions(params: {
  selectedPilotIds: number[];
  selectedPilotIdSet: Set<number>;
  coFlyEvidence: CoFlyEvidence[];
  allKnownPilotNamesById: Map<number, string>;
  pilotCardsById: Map<number, PilotCard>;
}): SuggestedPilot[] {
  const rankedCandidatesByAnchorId = collectRankedEligibleCandidatesByAnchorId({
    selectedPilotIds: params.selectedPilotIds,
    selectedPilotIdSet: params.selectedPilotIdSet,
    coFlyEvidence: params.coFlyEvidence,
    allKnownPilotNamesById: params.allKnownPilotNamesById,
    pilotCardsById: params.pilotCardsById
  });

  if (rankedCandidatesByAnchorId.size === 0) {
    return [];
  }

  let dedupedSuggestions: SuggestedPilot[] = [];
  for (const perSelectedCap of ADAPTIVE_PER_SELECTED_SUGGESTION_CAPS) {
    dedupedSuggestions = dedupeSuggestionsForPerSelectedCap({
      selectedPilotIds: params.selectedPilotIds,
      rankedCandidatesByAnchorId,
      perSelectedCap
    });
    if (dedupedSuggestions.length <= GLOBAL_SUGGESTION_CAP) {
      return sortSuggestionsByName(dedupedSuggestions);
    }
  }

  const globallyTrimmedSuggestions = [...dedupedSuggestions]
    .sort(compareSuggestionsForGlobalTrim)
    .slice(0, GLOBAL_SUGGESTION_CAP);
  return sortSuggestionsByName(globallyTrimmedSuggestions);
}

function collectRankedEligibleCandidatesByAnchorId(params: {
  selectedPilotIds: number[];
  selectedPilotIdSet: Set<number>;
  coFlyEvidence: CoFlyEvidence[];
  allKnownPilotNamesById: Map<number, string>;
  pilotCardsById: Map<number, PilotCard>;
}): Map<number, Array<{ characterId: number; name: string; ratio: number; sharedKillCount: number }>> {
  const strongestEligibleEvidenceByAnchorId = new Map<
    number,
    Map<number, { characterId: number; name: string; ratio: number; sharedKillCount: number }>
  >();

  for (const evidence of params.coFlyEvidence) {
    if (!params.selectedPilotIdSet.has(evidence.anchorPilotId)) {
      continue;
    }
    if (params.selectedPilotIdSet.has(evidence.candidatePilotId)) {
      continue;
    }
    if (!meetsSuggestionVisibilityThreshold(evidence)) {
      continue;
    }

    let strongestForAnchor = strongestEligibleEvidenceByAnchorId.get(evidence.anchorPilotId);
    if (!strongestForAnchor) {
      strongestForAnchor = new Map<number, { characterId: number; name: string; ratio: number; sharedKillCount: number }>();
      strongestEligibleEvidenceByAnchorId.set(evidence.anchorPilotId, strongestForAnchor);
    }

    const name = resolvePilotName({
      characterId: evidence.candidatePilotId,
      allKnownPilotNamesById: params.allKnownPilotNamesById,
      pilotCardsById: params.pilotCardsById
    });
    const existing = strongestForAnchor.get(evidence.candidatePilotId);
    if (
      !existing ||
      evidence.ratio > existing.ratio ||
      (evidence.ratio === existing.ratio && evidence.sharedKillCount > existing.sharedKillCount)
    ) {
      strongestForAnchor.set(evidence.candidatePilotId, {
        characterId: evidence.candidatePilotId,
        name,
        ratio: evidence.ratio,
        sharedKillCount: evidence.sharedKillCount
      });
    }
  }

  const rankedCandidatesByAnchorId = new Map<
    number,
    Array<{ characterId: number; name: string; ratio: number; sharedKillCount: number }>
  >();
  for (const anchorPilotId of params.selectedPilotIds) {
    const candidatesById = strongestEligibleEvidenceByAnchorId.get(anchorPilotId);
    if (!candidatesById || candidatesById.size === 0) {
      continue;
    }

    rankedCandidatesByAnchorId.set(
      anchorPilotId,
      [...candidatesById.values()].sort(compareSuggestionCandidatesForPerSelectedCap)
    );
  }

  return rankedCandidatesByAnchorId;
}

function dedupeSuggestionsForPerSelectedCap(params: {
  selectedPilotIds: number[];
  rankedCandidatesByAnchorId: Map<
    number,
    Array<{ characterId: number; name: string; ratio: number; sharedKillCount: number }>
  >;
  perSelectedCap: number;
}): SuggestedPilot[] {
  const dedupedByCharacterId = new Map<
    number,
    {
      characterId: number;
      name: string;
      sourcePilotIds: Set<number>;
      strongestRatio: number;
      strongestSharedKillCount: number;
    }
  >();

  for (const anchorPilotId of params.selectedPilotIds) {
    const rankedCandidates = params.rankedCandidatesByAnchorId.get(anchorPilotId);
    if (!rankedCandidates || rankedCandidates.length === 0) {
      continue;
    }

    for (const candidate of rankedCandidates.slice(0, params.perSelectedCap)) {
      let dedupedSuggestion = dedupedByCharacterId.get(candidate.characterId);
      if (!dedupedSuggestion) {
        dedupedSuggestion = {
          characterId: candidate.characterId,
          name: candidate.name,
          sourcePilotIds: new Set<number>(),
          strongestRatio: candidate.ratio,
          strongestSharedKillCount: candidate.sharedKillCount
        };
        dedupedByCharacterId.set(candidate.characterId, dedupedSuggestion);
      }

      dedupedSuggestion.sourcePilotIds.add(anchorPilotId);
      if (
        candidate.ratio > dedupedSuggestion.strongestRatio ||
        (candidate.ratio === dedupedSuggestion.strongestRatio &&
          candidate.sharedKillCount > dedupedSuggestion.strongestSharedKillCount)
      ) {
        dedupedSuggestion.strongestRatio = candidate.ratio;
        dedupedSuggestion.strongestSharedKillCount = candidate.sharedKillCount;
      }
    }
  }

  return [...dedupedByCharacterId.values()].map((suggestion) => ({
    characterId: suggestion.characterId,
    name: suggestion.name,
    sourcePilotIds: [...suggestion.sourcePilotIds].sort((leftPilotId, rightPilotId) => leftPilotId - rightPilotId),
    strongestRatio: suggestion.strongestRatio,
    strongestSharedKillCount: suggestion.strongestSharedKillCount,
    eligible: true
  }));
}

function compareSuggestionCandidatesForPerSelectedCap(
  leftCandidate: { characterId: number; name: string; ratio: number; sharedKillCount: number },
  rightCandidate: { characterId: number; name: string; ratio: number; sharedKillCount: number }
): number {
  return (
    rightCandidate.ratio - leftCandidate.ratio ||
    rightCandidate.sharedKillCount - leftCandidate.sharedKillCount ||
    leftCandidate.name.localeCompare(rightCandidate.name, "en", { sensitivity: "base" }) ||
    leftCandidate.characterId - rightCandidate.characterId
  );
}

function compareSuggestionsForGlobalTrim(leftSuggestion: SuggestedPilot, rightSuggestion: SuggestedPilot): number {
  return (
    rightSuggestion.strongestRatio - leftSuggestion.strongestRatio ||
    rightSuggestion.strongestSharedKillCount - leftSuggestion.strongestSharedKillCount ||
    leftSuggestion.name.localeCompare(rightSuggestion.name, "en", { sensitivity: "base" }) ||
    leftSuggestion.characterId - rightSuggestion.characterId
  );
}

function sortSuggestionsByName(suggestions: SuggestedPilot[]): SuggestedPilot[] {
  return [...suggestions].sort(
    (leftSuggestion, rightSuggestion) =>
      leftSuggestion.name.localeCompare(rightSuggestion.name, "en", { sensitivity: "base" }) ||
      leftSuggestion.characterId - rightSuggestion.characterId
  );
}

function resolvePilotName(params: {
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

function buildFleetGroups(params: {
  selectedPilotIds: number[];
  selectedPilotIdSet: Set<number>;
  coFlyEvidence: CoFlyEvidence[];
  visibleSuggestions: SuggestedPilot[];
  allKnownPilotNamesById: Map<number, string>;
  pilotCardsById: Map<number, PilotCard>;
}): { groups: FleetGroup[]; orderedPilotIds: number[] } {
  const visiblePilotIdSet = new Set<number>(params.selectedPilotIds);
  for (const suggestion of params.visibleSuggestions) {
    visiblePilotIdSet.add(suggestion.characterId);
  }

  const qualifiedRelations = collectQualifiedRelations({
    coFlyEvidence: params.coFlyEvidence,
    visiblePilotIdSet
  });
  if (qualifiedRelations.length === 0) {
    return {
      groups: [],
      orderedPilotIds: []
    };
  }

  const adjacencyByPilotId = new Map<number, Set<number>>();
  for (const relation of qualifiedRelations) {
    linkPilots(adjacencyByPilotId, relation.leftPilotId, relation.rightPilotId);
    linkPilots(adjacencyByPilotId, relation.rightPilotId, relation.leftPilotId);
  }

  const components = collectConnectedComponents(adjacencyByPilotId);
  const groups: FleetGroup[] = [];
  for (const componentPilotIds of components) {
    const componentPilotIdSet = new Set(componentPilotIds);
    const selectedPilotIds = componentPilotIds
      .filter((pilotId) => params.selectedPilotIdSet.has(pilotId))
      .sort((leftPilotId, rightPilotId) =>
        comparePilotIdsByName(leftPilotId, rightPilotId, {
          allKnownPilotNamesById: params.allKnownPilotNamesById,
          pilotCardsById: params.pilotCardsById
        })
      );

    if (selectedPilotIds.length === 0) {
      continue;
    }

    const suggestedPilotIds = componentPilotIds
      .filter((pilotId) => !params.selectedPilotIdSet.has(pilotId))
      .sort((leftPilotId, rightPilotId) =>
        comparePilotIdsByName(leftPilotId, rightPilotId, {
          allKnownPilotNamesById: params.allKnownPilotNamesById,
          pilotCardsById: params.pilotCardsById
        })
      );
    const memberPilotIds = [...selectedPilotIds, ...suggestedPilotIds];

    let weightedRatioSum = 0;
    let totalWeight = 0;
    for (const relation of qualifiedRelations) {
      if (
        componentPilotIdSet.has(relation.leftPilotId) &&
        componentPilotIdSet.has(relation.rightPilotId)
      ) {
        weightedRatioSum += relation.ratio * relation.sharedKillCount;
        totalWeight += relation.sharedKillCount;
      }
    }

    const groupId = stableFleetGroupId(memberPilotIds);
    groups.push({
      groupId,
      memberPilotIds,
      selectedPilotIds,
      suggestedPilotIds,
      weightedConfidence: totalWeight > 0 ? weightedRatioSum / totalWeight : 0,
      colorIndex: stableFleetGroupColorIndex(groupId)
    });
  }

  groups.sort((leftGroup, rightGroup) => {
    const confidenceDelta = rightGroup.weightedConfidence - leftGroup.weightedConfidence;
    if (Math.abs(confidenceDelta) > 1e-12) {
      return confidenceDelta;
    }

    const leftSortKey = buildGroupAlphabeticalSortKey(leftGroup.memberPilotIds, {
      allKnownPilotNamesById: params.allKnownPilotNamesById,
      pilotCardsById: params.pilotCardsById
    });
    const rightSortKey = buildGroupAlphabeticalSortKey(rightGroup.memberPilotIds, {
      allKnownPilotNamesById: params.allKnownPilotNamesById,
      pilotCardsById: params.pilotCardsById
    });
    const groupNameCompare = leftSortKey.localeCompare(rightSortKey, "en", { sensitivity: "base" });
    if (groupNameCompare !== 0) {
      return groupNameCompare;
    }
    return leftGroup.groupId.localeCompare(rightGroup.groupId, "en", { sensitivity: "base" });
  });

  if (groups.length === 0) {
    return {
      groups: [],
      orderedPilotIds: []
    };
  }

  const groupedPilotIds = new Set<number>();
  const orderedPilotIds: number[] = [];
  for (const group of groups) {
    for (const memberPilotId of group.memberPilotIds) {
      if (groupedPilotIds.has(memberPilotId)) {
        continue;
      }
      groupedPilotIds.add(memberPilotId);
      orderedPilotIds.push(memberPilotId);
    }
  }

  const ungroupedSelectedPilotIds = params.selectedPilotIds
    .filter((pilotId) => !groupedPilotIds.has(pilotId))
    .sort((leftPilotId, rightPilotId) =>
      comparePilotIdsByName(leftPilotId, rightPilotId, {
        allKnownPilotNamesById: params.allKnownPilotNamesById,
        pilotCardsById: params.pilotCardsById
      })
    );
  orderedPilotIds.push(...ungroupedSelectedPilotIds);

  return {
    groups,
    orderedPilotIds
  };
}

function collectQualifiedRelations(params: {
  coFlyEvidence: CoFlyEvidence[];
  visiblePilotIdSet: Set<number>;
}): Array<{
  leftPilotId: number;
  rightPilotId: number;
  ratio: number;
  sharedKillCount: number;
}> {
  const strongestRelationByPair = new Map<
    string,
    { leftPilotId: number; rightPilotId: number; ratio: number; sharedKillCount: number }
  >();

  for (const evidence of params.coFlyEvidence) {
    if (!meetsGroupingRelationThreshold(evidence)) {
      continue;
    }
    if (
      !params.visiblePilotIdSet.has(evidence.anchorPilotId) ||
      !params.visiblePilotIdSet.has(evidence.candidatePilotId)
    ) {
      continue;
    }
    if (evidence.anchorPilotId === evidence.candidatePilotId) {
      continue;
    }

    const leftPilotId = Math.min(evidence.anchorPilotId, evidence.candidatePilotId);
    const rightPilotId = Math.max(evidence.anchorPilotId, evidence.candidatePilotId);
    const relationKey = `${leftPilotId}:${rightPilotId}`;
    const existing = strongestRelationByPair.get(relationKey);
    if (
      !existing ||
      evidence.ratio > existing.ratio ||
      (evidence.ratio === existing.ratio && evidence.sharedKillCount > existing.sharedKillCount)
    ) {
      strongestRelationByPair.set(relationKey, {
        leftPilotId,
        rightPilotId,
        ratio: evidence.ratio,
        sharedKillCount: evidence.sharedKillCount
      });
    }
  }

  return [...strongestRelationByPair.values()].sort(
    (left, right) =>
      left.leftPilotId - right.leftPilotId || left.rightPilotId - right.rightPilotId
  );
}

function linkPilots(adjacencyByPilotId: Map<number, Set<number>>, fromPilotId: number, toPilotId: number): void {
  let neighbors = adjacencyByPilotId.get(fromPilotId);
  if (!neighbors) {
    neighbors = new Set<number>();
    adjacencyByPilotId.set(fromPilotId, neighbors);
  }
  neighbors.add(toPilotId);
}

function collectConnectedComponents(adjacencyByPilotId: Map<number, Set<number>>): number[][] {
  const visitedPilotIds = new Set<number>();
  const components: number[][] = [];
  const seedPilotIds = [...adjacencyByPilotId.keys()].sort((left, right) => left - right);

  for (const seedPilotId of seedPilotIds) {
    if (visitedPilotIds.has(seedPilotId)) {
      continue;
    }

    const stack = [seedPilotId];
    const component: number[] = [];
    while (stack.length > 0) {
      const currentPilotId = stack.pop();
      if (typeof currentPilotId !== "number" || visitedPilotIds.has(currentPilotId)) {
        continue;
      }

      visitedPilotIds.add(currentPilotId);
      component.push(currentPilotId);

      const neighbors = [...(adjacencyByPilotId.get(currentPilotId) ?? [])].sort(
        (left, right) => right - left
      );
      for (const neighborPilotId of neighbors) {
        if (!visitedPilotIds.has(neighborPilotId)) {
          stack.push(neighborPilotId);
        }
      }
    }
    components.push(component);
  }

  return components;
}

function comparePilotIdsByName(
  leftPilotId: number,
  rightPilotId: number,
  params: {
    allKnownPilotNamesById: Map<number, string>;
    pilotCardsById: Map<number, PilotCard>;
  }
): number {
  const leftName = resolvePilotName({
    characterId: leftPilotId,
    allKnownPilotNamesById: params.allKnownPilotNamesById,
    pilotCardsById: params.pilotCardsById
  });
  const rightName = resolvePilotName({
    characterId: rightPilotId,
    allKnownPilotNamesById: params.allKnownPilotNamesById,
    pilotCardsById: params.pilotCardsById
  });
  return leftName.localeCompare(rightName, "en", { sensitivity: "base" }) || leftPilotId - rightPilotId;
}

function buildGroupAlphabeticalSortKey(
  memberPilotIds: number[],
  params: {
    allKnownPilotNamesById: Map<number, string>;
    pilotCardsById: Map<number, PilotCard>;
  }
): string {
  const sortedMemberIds = [...memberPilotIds].sort((leftPilotId, rightPilotId) =>
    comparePilotIdsByName(leftPilotId, rightPilotId, params)
  );
  return sortedMemberIds
    .map((pilotId) =>
      resolvePilotName({
        characterId: pilotId,
        allKnownPilotNamesById: params.allKnownPilotNamesById,
        pilotCardsById: params.pilotCardsById
      }).toLocaleLowerCase("en-US")
    )
    .join("|");
}

function meetsGroupingRelationThreshold(evidence: CoFlyEvidence): boolean {
  return meetsSuggestionVisibilityThreshold(evidence);
}
