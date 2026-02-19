import type { DogmaIndex } from "../dogma/index";
import type { FitResolvedSlots } from "../dogma/types";

export function enrichResolvedSlotsWithDogmaMetadata(
  slots: FitResolvedSlots,
  dogmaIndex: DogmaIndex | null | undefined
): FitResolvedSlots {
  if (!dogmaIndex) {
    return slots;
  }

  return {
    high: enrichSlotEntries(slots.high, dogmaIndex),
    mid: enrichSlotEntries(slots.mid, dogmaIndex),
    low: enrichSlotEntries(slots.low, dogmaIndex),
    rig: enrichSlotEntries(slots.rig, dogmaIndex),
    cargo: enrichSlotEntries(slots.cargo, dogmaIndex),
    other: enrichSlotEntries(slots.other, dogmaIndex)
  };
}

function enrichSlotEntries(
  entries: FitResolvedSlots["high"],
  dogmaIndex: DogmaIndex
): FitResolvedSlots["high"] {
  return entries.map((entry) => {
    const dogmaType = dogmaIndex.typesById.get(entry.typeId);
    if (!dogmaType) {
      return entry;
    }
    const effectIds = normalizeEffectIds(dogmaType.effectsById);
    return {
      ...entry,
      groupId: isFinitePositiveInt(dogmaType.groupId) ? dogmaType.groupId : undefined,
      categoryId: isFinitePositiveInt(dogmaType.categoryId) ? dogmaType.categoryId : undefined,
      effectIds: effectIds.length > 0 ? effectIds : undefined
    };
  });
}

function normalizeEffectIds(effectIds: number[] | undefined): number[] {
  if (!Array.isArray(effectIds)) {
    return [];
  }
  return [...new Set(effectIds.filter(isFinitePositiveInt))].sort((a, b) => a - b);
}

function isFinitePositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
