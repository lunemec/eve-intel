export type DogmaTypeEntry = {
  typeId: number;
  groupId?: number;
  categoryId?: number;
  name: string;
  attrs: Record<string, number>;
  effects: string[];
};

export type DogmaGroupEntry = {
  groupId: number;
  categoryId?: number;
  name: string;
};

export type DogmaCategoryEntry = {
  categoryId: number;
  name: string;
};

export type DogmaPack = {
  formatVersion: number;
  source: string;
  sdeVersion: string;
  generatedAt: string;
  typeCount: number;
  types: DogmaTypeEntry[];
  groups: DogmaGroupEntry[];
  categories: DogmaCategoryEntry[];
};

export type DogmaManifest = {
  activeVersion: string;
  packFile: string;
  sha256: string;
  generatedAt: string;
};

export type FitResolvedModule = {
  typeId: number;
  name: string;
  flag?: number;
  chargeTypeId?: number;
  chargeName?: string;
  quantity?: number;
};

export type FitResolvedSlots = {
  high: FitResolvedModule[];
  mid: FitResolvedModule[];
  low: FitResolvedModule[];
  rig: FitResolvedModule[];
  cargo: FitResolvedModule[];
  other: FitResolvedModule[];
};

export type DamageProfile = {
  em: number;
  therm: number;
  kin: number;
  exp: number;
};

export type ResistProfile = {
  em: number;
  therm: number;
  kin: number;
  exp: number;
};

export type LayerResists = {
  shield: ResistProfile;
  armor: ResistProfile;
  hull: ResistProfile;
};

export type EngagementRange = {
  optimal: number;
  falloff: number;
  missileMax: number;
  effectiveBand: number;
};

export type SpeedProfile = {
  base: number;
  propOn: number;
  propOnHeated: number;
};

export type SignatureProfile = {
  base: number;
  propOn: number;
};

export type CombatMetrics = {
  dpsTotal: number;
  alpha: number;
  damageSplit: DamageProfile;
  engagementRange: EngagementRange;
  speed: SpeedProfile;
  signature: SignatureProfile;
  ehp: number;
  resists: LayerResists;
  confidence: number;
  assumptions: string[];
};
