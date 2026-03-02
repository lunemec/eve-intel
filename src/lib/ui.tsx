import type { FitCandidate } from "./intel";
import { classifyTankByModuleMetadata, type TankType } from "./tank/classifier";

const TANK_TYPES: TankType[] = ["shield", "armor", "hull"];
type FitModule = NonNullable<FitCandidate["modulesBySlot"]>["high"][number];
type FitModuleWithDogmaMeta = FitModule & {
  effects?: string[];
  effectsMeta?: Array<{ effectId?: number; effectName?: string }>;
};

export type TankInferenceDiagnostic =
  | { kind: "fallback-regex" }
  | { kind: "module-no-classification-signal"; typeId?: number };

const TANK_IMPACT_WEIGHT = {
  major: 4,
  medium: 3,
  minor: 1
} as const;

const TANK_NAME_RULES: Record<TankType, Array<{ pattern: RegExp; weight: number }>> = {
  shield: [
    { pattern: /shield extender/i, weight: TANK_IMPACT_WEIGHT.major },
    {
      pattern: /core defense (?:field )?(?:extender|purger|safeguard|operational solidifier)/i,
      weight: TANK_IMPACT_WEIGHT.major
    },
    { pattern: /ancillary shield booster|shield booster/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /shield boost amplifier/i, weight: TANK_IMPACT_WEIGHT.medium },
    { pattern: /shield hardener|shield resistance|shield reinforcer|screen reinforcer/i, weight: TANK_IMPACT_WEIGHT.minor }
  ],
  armor: [
    { pattern: /armor plate|steel plates|crystalline carbonide.*plates/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /armor repairer|ancillary armor/i, weight: TANK_IMPACT_WEIGHT.major },
    {
      pattern: /trimark armor pump|auxiliary nano pump|nanobot accelerator|anti-.*pump/i,
      weight: TANK_IMPACT_WEIGHT.major
    },
    { pattern: /armor reinforcer/i, weight: TANK_IMPACT_WEIGHT.minor },
    { pattern: /armor hardener|armor resistance/i, weight: TANK_IMPACT_WEIGHT.minor }
  ],
  hull: [
    { pattern: /hull reinforcer|transverse bulkhead|bulkhead/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /hull repairer|structure repairer/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /hull resistance|structure resistance/i, weight: TANK_IMPACT_WEIGHT.minor }
  ]
};

const TANK_EFFECT_RULES: Record<TankType, Array<{ pattern: RegExp; weight: number }>> = {
  shield: [
    { pattern: /shield.*(?:capacity|hp).*bonus/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /shield.*(?:boost|booster|boostamplifier|safeguard|purger|solidifier)/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /shield.*(?:resonance|resistance|reinforcer|hardener|purger)/i, weight: TANK_IMPACT_WEIGHT.minor }
  ],
  armor: [
    { pattern: /armor.*(?:hp|hitpoint).*bonus/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /armor.*(?:repair|repairer|nanobot|pump|damageamount)/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /armor.*(?:resonance|resistance|reinforcer|hardener)/i, weight: TANK_IMPACT_WEIGHT.minor }
  ],
  hull: [
    { pattern: /(?:hull|structure).*(?:hp|hitpoint).*bonus/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /(?:hull|structure).*(?:repair|repairer|bulkhead)/i, weight: TANK_IMPACT_WEIGHT.major },
    { pattern: /(?:hull|structure).*(?:resonance|resistance|reinforcer)/i, weight: TANK_IMPACT_WEIGHT.minor }
  ]
};

export function inferTankTypeFromFit(
  fit: FitCandidate | undefined,
  options?: { onDiagnostic?: (entry: TankInferenceDiagnostic) => void }
): TankType | null {
  if (!fit) {
    return null;
  }

  const resolvedModules = collectResolvedFitModules(fit);
  if (hasIdMetadataEvidence(resolvedModules)) {
    const classified = classifyTankByModuleMetadata(
      resolvedModules.map((module) => ({
        typeId: module.typeId,
        groupId: module.groupId,
        categoryId: module.categoryId,
        effectIds: module.effectIds
      }))
    );

    for (const module of classified.unclassifiedTankLikeModules) {
      options?.onDiagnostic?.({
        kind: "module-no-classification-signal",
        typeId: module.typeId
      });
    }

    return classified.tankType;
  }

  options?.onDiagnostic?.({ kind: "fallback-regex" });

  const scores: Record<TankType, number> = {
    shield: 0,
    armor: 0,
    hull: 0
  };

  if (hasResolvedModuleEvidence(resolvedModules)) {
    scoreResolvedModules(resolvedModules, scores);
  } else {
    const eftModuleNames = collectEftModuleNames(fit);
    if (eftModuleNames.length === 0) {
      return null;
    }
    scoreModuleNames(eftModuleNames, scores);
  }

  const hasAnyScore = TANK_TYPES.some((tankType) => scores[tankType] > 0);
  if (!hasAnyScore) {
    for (const module of resolvedModules) {
      options?.onDiagnostic?.({
        kind: "module-no-classification-signal",
        typeId: module.typeId
      });
    }
  }

  const orderedScores = TANK_TYPES.map((tankType) => scores[tankType]).sort((a, b) => b - a);
  const topScore = orderedScores[0] ?? 0;
  if (topScore < 4) {
    return null;
  }

  const topMatches = TANK_TYPES.filter((tankType) => scores[tankType] === topScore);
  if (topMatches.length !== 1) {
    return null;
  }

  const secondScore = orderedScores[1] ?? 0;
  if (topScore - secondScore < 2) {
    return null;
  }

  return topMatches[0];
}

function hasIdMetadataEvidence(modules: FitModuleWithDogmaMeta[]): boolean {
  return modules.some((module) => {
    if (typeof module.groupId === "number" && module.groupId > 0) {
      return true;
    }
    if (typeof module.categoryId === "number" && module.categoryId > 0) {
      return true;
    }
    return Array.isArray(module.effectIds) && module.effectIds.some((effectId) => Number.isInteger(effectId) && effectId > 0);
  });
}

function collectResolvedFitModules(fit: FitCandidate): FitModuleWithDogmaMeta[] {
  if (!fit.modulesBySlot) {
    return [];
  }

  return [
    ...fit.modulesBySlot.high,
    ...fit.modulesBySlot.mid,
    ...fit.modulesBySlot.low,
    ...fit.modulesBySlot.rig,
    ...fit.modulesBySlot.other
  ] as FitModuleWithDogmaMeta[];
}

function collectEftModuleNames(fit: FitCandidate): string[] {
  const namesFromEft: string[] = [];
  if (!fit.eftSections) {
    return namesFromEft;
  }

  const sections = [
    ...fit.eftSections.high,
    ...fit.eftSections.mid,
    ...fit.eftSections.low,
    ...fit.eftSections.rig,
    ...fit.eftSections.other
  ];

  for (const sectionName of sections) {
    if (typeof sectionName === "string" && sectionName.trim()) {
      namesFromEft.push(sectionName.toLowerCase());
    }
  }

  return namesFromEft;
}

function hasResolvedModuleEvidence(modules: FitModuleWithDogmaMeta[]): boolean {
  return modules.some((module) => {
    if (normalizeModuleName(module.name)) {
      return true;
    }
    return collectModuleEffectNames(module).length > 0;
  });
}

function scoreResolvedModules(modules: FitModuleWithDogmaMeta[], scores: Record<TankType, number>): void {
  for (const module of modules) {
    const hasMetadataMatch = applyTankRules(collectModuleEffectNames(module), TANK_EFFECT_RULES, scores);
    if (hasMetadataMatch) {
      continue;
    }

    const moduleName = normalizeModuleName(module.name);
    if (moduleName) {
      applyTankRules([moduleName], TANK_NAME_RULES, scores);
    }
  }
}

function scoreModuleNames(moduleNames: string[], scores: Record<TankType, number>): void {
  for (const moduleName of moduleNames) {
    applyTankRules([moduleName], TANK_NAME_RULES, scores);
  }
}

function applyTankRules(
  values: string[],
  rules: Record<TankType, Array<{ pattern: RegExp; weight: number }>>,
  scores: Record<TankType, number>
): boolean {
  let matched = false;
  for (const tankType of TANK_TYPES) {
    let bestWeight = 0;
    for (const value of values) {
      for (const rule of rules[tankType]) {
        if (rule.pattern.test(value)) {
          bestWeight = Math.max(bestWeight, rule.weight);
        }
      }
    }

    if (bestWeight > 0) {
      scores[tankType] += bestWeight;
      matched = true;
    }
  }

  return matched;
}

function collectModuleEffectNames(module: FitModuleWithDogmaMeta): string[] {
  const effectNames: string[] = [];

  if (Array.isArray(module.effects)) {
    for (const effect of module.effects) {
      if (typeof effect === "string" && effect.trim()) {
        effectNames.push(effect.toLowerCase());
      }
    }
  }

  if (Array.isArray(module.effectsMeta)) {
    for (const effect of module.effectsMeta) {
      if (typeof effect?.effectName === "string" && effect.effectName.trim()) {
        effectNames.push(effect.effectName.toLowerCase());
      }
    }
  }

  return [...new Set(effectNames)];
}

function normalizeModuleName(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase();
}
