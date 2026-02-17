import type { DogmaIndex } from "./dogma/index";

export function withDogmaTypeNameFallback(
  ids: number[],
  namesById: Map<number, string>,
  dogmaIndex: DogmaIndex | null
): { namesById: Map<number, string>; backfilledCount: number } {
  if (!dogmaIndex || ids.length === 0) {
    return { namesById, backfilledCount: 0 };
  }

  const merged = new Map<number, string>(namesById);
  let backfilledCount = 0;

  for (const id of ids) {
    if (!Number.isFinite(id) || id <= 0 || merged.has(id)) {
      continue;
    }
    const row = dogmaIndex.typesById.get(id);
    if (!row?.name) {
      continue;
    }
    merged.set(id, row.name);
    backfilledCount += 1;
  }

  return { namesById: merged, backfilledCount };
}

