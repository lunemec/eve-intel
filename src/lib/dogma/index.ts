import type { DogmaPack, DogmaTypeEntry } from "./types";

export type DogmaIndex = {
  pack: DogmaPack;
  typesById: Map<number, DogmaTypeEntry>;
  typeIdByName: Map<string, number>;
  groupNameById: Map<number, string>;
  categoryNameById: Map<number, string>;
  attributeIdByName: Map<string, number>;
  effectIdByName: Map<string, number>;
};

export function buildDogmaIndex(pack: DogmaPack): DogmaIndex {
  const typesById = new Map<number, DogmaTypeEntry>();
  const typeIdByName = new Map<string, number>();
  const groupNameById = new Map<number, string>();
  const categoryNameById = new Map<number, string>();
  const attributeIdByName = new Map<string, number>();
  const effectIdByName = new Map<string, number>();
  for (const row of pack.types) {
    typesById.set(row.typeId, row);
    typeIdByName.set(row.name.toLowerCase(), row.typeId);
  }
  for (const row of pack.groups ?? []) {
    groupNameById.set(row.groupId, row.name);
  }
  for (const row of pack.categories ?? []) {
    categoryNameById.set(row.categoryId, row.name);
  }
  for (const row of pack.attributeTypes ?? []) {
    attributeIdByName.set(normalizeAttrName(row.attributeName), row.attributeId);
  }
  for (const row of pack.effectTypes ?? []) {
    effectIdByName.set(normalizeAttrName(row.effectName), row.effectId);
  }
  return {
    pack,
    typesById,
    typeIdByName,
    groupNameById,
    categoryNameById,
    attributeIdByName,
    effectIdByName
  };
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

export function getAttrById(type: DogmaTypeEntry | undefined, attributeId: number): number | undefined {
  if (!type || attributeId <= 0) {
    return undefined;
  }
  const direct = type.attrsById?.[attributeId];
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }
  return undefined;
}

export function resolveAttributeIdByName(index: DogmaIndex, attributeName: string): number | undefined {
  return index.attributeIdByName.get(normalizeAttrName(attributeName));
}

export function resolveEffectIdByName(index: DogmaIndex, effectName: string): number | undefined {
  return index.effectIdByName.get(normalizeAttrName(effectName));
}

function normalizeAttrName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
