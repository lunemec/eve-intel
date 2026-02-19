export type TankType = "shield" | "armor" | "hull";

const TANK_TYPES: TankType[] = ["shield", "armor", "hull"];

const SCORE_WEIGHT = {
  major: 4,
  medium: 3,
  minor: 1
} as const;

export const TANK_INFERENCE_MIN_SCORE = 4;
export const TANK_INFERENCE_MIN_MARGIN = 2;

export type TankClassifierModuleInput = {
  typeId?: number;
  groupId?: number;
  categoryId?: number;
  effectIds?: number[];
};

export type TankClassifierResult = {
  tankType: TankType | null;
  scores: Record<TankType, number>;
  matchedSignals: Array<{
    tankType: TankType;
    signal: string;
    weight: number;
    moduleTypeId?: number;
  }>;
  unclassifiedTankLikeModules: Array<{
    typeId?: number;
    groupId?: number;
    categoryId?: number;
    effectIds: number[];
  }>;
};

type TankRules = {
  typeIdMajor: Record<TankType, Set<number>>;
  groupMajor: Record<TankType, Set<number>>;
  effectMajor: Record<TankType, Set<number>>;
  effectMinor: Record<TankType, Set<number>>;
};

// Canonical tank rules keyed by stable IDs. Keep all tank inference IDs here.
const RULES: TankRules = {
  typeIdMajor: {
    shield: new Set([32780, 31790]),
    armor: new Set([33101, 31055, 31047, 31065]),
    hull: new Set([2355, 1333, 1335, 5647, 5649, 33890, 34485, 34487])
  },
  groupMajor: {
    shield: new Set([1156, 774]),
    armor: new Set([1199]),
    hull: new Set([63])
  },
  effectMajor: {
    shield: new Set([4936, 446, 2795, 486, 4967]),
    armor: new Set([27, 271, 2792, 2837, 5275]),
    hull: new Set([26, 392, 1281])
  },
  effectMinor: {
    shield: new Set([5230, 2052]),
    armor: new Set([2041]),
    hull: new Set([])
  }
};

export function classifyTankByModuleMetadata(modules: TankClassifierModuleInput[]): TankClassifierResult {
  const scores: Record<TankType, number> = {
    shield: 0,
    armor: 0,
    hull: 0
  };
  const matchedSignals: TankClassifierResult["matchedSignals"] = [];
  const unclassifiedTankLikeModules: TankClassifierResult["unclassifiedTankLikeModules"] = [];

  for (const module of modules) {
    const effectIds = normalizeIds(module.effectIds);
    let hasMajorSignal = false;

    for (const tankType of TANK_TYPES) {
      let moduleWeight = 0;
      const moduleSignals: Array<{ signal: string; weight: number }> = [];

      if (isValidId(module.typeId) && RULES.typeIdMajor[tankType].has(module.typeId)) {
        moduleWeight = Math.max(moduleWeight, SCORE_WEIGHT.major);
        moduleSignals.push({ signal: `typeId:${module.typeId}`, weight: SCORE_WEIGHT.major });
        hasMajorSignal = true;
      }

      if (isValidId(module.groupId) && RULES.groupMajor[tankType].has(module.groupId)) {
        moduleWeight = Math.max(moduleWeight, SCORE_WEIGHT.medium);
        moduleSignals.push({ signal: `groupId:${module.groupId}`, weight: SCORE_WEIGHT.medium });
      }

      if (tankType === "shield" && isShieldLocalBooster(module.groupId, effectIds)) {
        moduleWeight = Math.max(moduleWeight, SCORE_WEIGHT.major);
        moduleSignals.push({ signal: "groupEffectId:40+3201", weight: SCORE_WEIGHT.major });
        hasMajorSignal = true;
      }

      if (tankType === "shield" && isShieldBoostAmplifier(module.groupId, effectIds)) {
        moduleWeight = Math.max(moduleWeight, SCORE_WEIGHT.major);
        moduleSignals.push({ signal: "groupEffectId:338+(1720|3061)", weight: SCORE_WEIGHT.major });
        hasMajorSignal = true;
      }

      if (tankType === "shield" && isShieldExtender(module.groupId)) {
        moduleWeight = Math.max(moduleWeight, SCORE_WEIGHT.major);
        moduleSignals.push({ signal: "groupId:38", weight: SCORE_WEIGHT.major });
        hasMajorSignal = true;
      }

      if (tankType === "shield" && isShieldPowerRelay(module.groupId, effectIds)) {
        moduleWeight = Math.max(moduleWeight, SCORE_WEIGHT.major);
        moduleSignals.push({ signal: "groupEffectId:57+5461", weight: SCORE_WEIGHT.major });
        hasMajorSignal = true;
      }

      if (hasAny(effectIds, RULES.effectMajor[tankType])) {
        moduleWeight = Math.max(moduleWeight, SCORE_WEIGHT.major);
        moduleSignals.push({ signal: "effectId:major", weight: SCORE_WEIGHT.major });
        hasMajorSignal = true;
      } else if (hasAny(effectIds, RULES.effectMinor[tankType])) {
        moduleWeight = Math.max(moduleWeight, SCORE_WEIGHT.minor);
        moduleSignals.push({ signal: "effectId:minor", weight: SCORE_WEIGHT.minor });
      }

      if (moduleWeight > 0) {
        scores[tankType] += moduleWeight;
        matchedSignals.push({
          tankType,
          signal: moduleSignals.map((entry) => entry.signal).join("+"),
          weight: moduleWeight,
          moduleTypeId: module.typeId
        });
      }
    }

    if (!hasMajorSignal && isTankLike(module.groupId, effectIds)) {
      unclassifiedTankLikeModules.push({
        typeId: module.typeId,
        groupId: module.groupId,
        categoryId: module.categoryId,
        effectIds
      });
    }
  }

  const tankType = resolveWinningTankType(scores);
  return { tankType, scores, matchedSignals, unclassifiedTankLikeModules };
}

function resolveWinningTankType(scores: Record<TankType, number>): TankType | null {
  const orderedScores = TANK_TYPES.map((tankType) => scores[tankType]).sort((a, b) => b - a);
  const topScore = orderedScores[0] ?? 0;
  if (topScore < TANK_INFERENCE_MIN_SCORE) {
    return null;
  }

  const topMatches = TANK_TYPES.filter((tankType) => scores[tankType] === topScore);
  if (topMatches.length !== 1) {
    return null;
  }

  const secondScore = orderedScores[1] ?? 0;
  if (topScore - secondScore < TANK_INFERENCE_MIN_MARGIN) {
    return null;
  }

  return topMatches[0];
}

function normalizeIds(ids: number[] | undefined): number[] {
  if (!Array.isArray(ids)) {
    return [];
  }
  const normalized: number[] = [];
  for (const id of ids) {
    if (isValidId(id)) {
      normalized.push(id);
    }
  }
  return normalized;
}

function isValidId(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function hasAny(values: number[], expected: Set<number>): boolean {
  for (const value of values) {
    if (expected.has(value)) {
      return true;
    }
  }
  return false;
}

function isTankLike(groupId: number | undefined, effectIds: number[]): boolean {
  const groupSets = [RULES.groupMajor.shield, RULES.groupMajor.armor, RULES.groupMajor.hull];
  if (isValidId(groupId) && groupSets.some((set) => set.has(groupId))) {
    return true;
  }
  const effectSets = [
    RULES.effectMajor.shield,
    RULES.effectMajor.armor,
    RULES.effectMajor.hull,
    RULES.effectMinor.shield,
    RULES.effectMinor.armor,
    RULES.effectMinor.hull
  ];
  return effectSets.some((set) => hasAny(effectIds, set));
}

function isShieldLocalBooster(groupId: number | undefined, effectIds: number[]): boolean {
  return groupId === 40 && effectIds.includes(3201);
}

function isShieldBoostAmplifier(groupId: number | undefined, effectIds: number[]): boolean {
  return groupId === 338 && (effectIds.includes(1720) || effectIds.includes(3061));
}

function isShieldExtender(groupId: number | undefined): boolean {
  return groupId === 38;
}

function isShieldPowerRelay(groupId: number | undefined, effectIds: number[]): boolean {
  return groupId === 57 && effectIds.includes(5461);
}
