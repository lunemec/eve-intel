import type { DogmaIndex } from "../index";
import type { DogmaTypeEntry, FitResolvedModule } from "../types";

export type EngineContext = {
  index: DogmaIndex;
  ship: DogmaTypeEntry | undefined;
  assumptions: string[];
};

export type OffenseStageInput = {
  weaponModules: FitResolvedModule[];
  droneModules: FitResolvedModule[];
};

export type DefenseStageInput = {
  tankModules: FitResolvedModule[];
};

export type EngineTrace = {
  stage: string;
  message: string;
  source?: string;
};
