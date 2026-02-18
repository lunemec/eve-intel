const SLOT_NAMES = ["high", "mid", "low", "rig", "subsystem", "otherFitted"];

export function normalizeZkillFittedItems({ shipTypeId, items }) {
  if (!Number.isInteger(shipTypeId) || shipTypeId <= 0) {
    throw new TypeError("shipTypeId must be a positive integer.");
  }

  const groups = new Map();
  for (const slotName of SLOT_NAMES) {
    groups.set(slotName, new Map());
  }

  for (const item of flattenItems(items)) {
    const slotName = slotFromFlag(item?.flag);
    if (!slotName) {
      continue;
    }

    const typeId = parsePositiveInteger(item?.item_type_id);
    if (!typeId) {
      continue;
    }

    const quantity = resolveQuantity(item);
    const slotKey = `${typeId}`;
    const slotGroup = groups.get(slotName);
    const previous = slotGroup.get(slotKey);
    if (previous) {
      previous.quantity += quantity;
    } else {
      slotGroup.set(slotKey, { typeId, quantity });
    }
  }

  return {
    shipTypeId,
    slots: toSortedSlots(groups)
  };
}

function toSortedSlots(groups) {
  return {
    high: toSortedEntries(groups.get("high")),
    mid: toSortedEntries(groups.get("mid")),
    low: toSortedEntries(groups.get("low")),
    rig: toSortedEntries(groups.get("rig")),
    subsystem: toSortedEntries(groups.get("subsystem")),
    otherFitted: toSortedEntries(groups.get("otherFitted"))
  };
}

function toSortedEntries(entriesByKey) {
  return [...entriesByKey.values()].sort((left, right) => left.typeId - right.typeId);
}

function flattenItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const flattened = [];
  const queue = [...items];
  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    if (!item || typeof item !== "object") {
      continue;
    }

    flattened.push(item);
    if (Array.isArray(item.items) && item.items.length > 0) {
      queue.push(...item.items);
    }
  }

  return flattened;
}

function slotFromFlag(rawFlag) {
  const flag = parsePositiveInteger(rawFlag);
  if (!flag) {
    return null;
  }

  if (flag >= 27 && flag <= 34) {
    return "high";
  }
  if (flag >= 19 && flag <= 26) {
    return "mid";
  }
  if (flag >= 11 && flag <= 18) {
    return "low";
  }
  if (flag >= 92 && flag <= 99) {
    return "rig";
  }
  if (flag >= 125 && flag <= 132) {
    return "subsystem";
  }
  if ((flag >= 159 && flag <= 163) || (flag >= 164 && flag <= 173)) {
    return "otherFitted";
  }

  return null;
}

function resolveQuantity(item) {
  const destroyed = parseNonNegativeInteger(item?.quantity_destroyed);
  const dropped = parseNonNegativeInteger(item?.quantity_dropped);
  const total = destroyed + dropped;
  return total > 0 ? total : 1;
}

function parsePositiveInteger(value) {
  if (typeof value !== "number") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseNonNegativeInteger(value) {
  if (typeof value !== "number") {
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}
