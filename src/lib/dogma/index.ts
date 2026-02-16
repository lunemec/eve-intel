import type { DogmaPack, DogmaTypeEntry } from "./types";

export type DogmaIndex = {
  pack: DogmaPack;
  typesById: Map<number, DogmaTypeEntry>;
  typeIdByName: Map<string, number>;
};

export function buildDogmaIndex(pack: DogmaPack): DogmaIndex {
  const typesById = new Map<number, DogmaTypeEntry>();
  const typeIdByName = new Map<string, number>();
  for (const row of pack.types) {
    typesById.set(row.typeId, row);
    typeIdByName.set(row.name.toLowerCase(), row.typeId);
  }
  return { pack, typesById, typeIdByName };
}

export function getType(index: DogmaIndex, typeId: number): DogmaTypeEntry | undefined {
  return index.typesById.get(typeId);
}

export function resolveTypeIdByName(index: DogmaIndex, name: string): number | undefined {
  return index.typeIdByName.get(name.trim().toLowerCase());
}

export function getAttr(type: DogmaTypeEntry | undefined, ...names: string[]): number | undefined {
  if (!type) {
    return undefined;
  }
  for (const name of names) {
    const value = type.attrs[name];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

