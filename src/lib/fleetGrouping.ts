import type { PilotCard } from "./pilotDomain";

export const FLEET_GROUPING_VERSION = 1 as const;

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
  const sourceSignature = buildFleetGroupingSourceSignature(input.selectedPilotIds);

  // Step-1 skeleton: later steps fill in extraction, thresholds, grouping, and ordering.
  const state = createEmptyFleetGroupingState({
    generatedAtMs: input.nowMs,
    sourceSignature
  });

  return {
    state,
    orderedPilotIds: [],
    groups: [],
    suggestions: []
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
