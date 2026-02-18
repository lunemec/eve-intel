import { createHash } from "node:crypto";

const SLOT_ORDER = ["high", "mid", "low", "rig", "subsystem", "otherFitted"];

export function dedupeFitRecords(records, { computeFitHash = computeCanonicalFitHash } = {}) {
  if (!Array.isArray(records)) {
    throw new TypeError("records must be an array.");
  }
  if (typeof computeFitHash !== "function") {
    throw new TypeError("computeFitHash must be a function.");
  }

  const kept = [];
  const seenKillmailIds = new Set();
  const seenFitHashes = new Set();
  let duplicatesSkipped = 0;

  for (const record of records) {
    const killmailId = parsePositiveInteger(record?.killmailId);
    if (!killmailId) {
      throw new TypeError("record.killmailId must be a positive integer.");
    }

    if (seenKillmailIds.has(killmailId)) {
      duplicatesSkipped += 1;
      continue;
    }

    const fitHash = resolveRecordFitHash(record, computeFitHash);
    if (seenFitHashes.has(fitHash)) {
      duplicatesSkipped += 1;
      continue;
    }

    seenKillmailIds.add(killmailId);
    seenFitHashes.add(fitHash);
    kept.push(record);
  }

  return {
    records: kept,
    duplicatesSkipped
  };
}

export function computeCanonicalFitHash(fit) {
  const shipTypeId = parsePositiveInteger(fit?.shipTypeId);
  if (!shipTypeId) {
    throw new TypeError("fit.shipTypeId must be a positive integer.");
  }

  const slots = fit?.slots ?? {};
  const canonicalSlots = {};
  for (const slotName of SLOT_ORDER) {
    canonicalSlots[slotName] = canonicalizeSlotEntries(slots[slotName]);
  }

  const canonical = JSON.stringify({ shipTypeId, slots: canonicalSlots });
  return createHash("sha256").update(canonical).digest("hex");
}

function resolveRecordFitHash(record, computeFitHash) {
  const rawHash = typeof record?.fit?.fitHash === "string" ? record.fit.fitHash.trim() : "";
  if (rawHash) {
    return rawHash.toLowerCase();
  }
  return computeFitHash(record?.fit);
}

function canonicalizeSlotEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  const grouped = new Map();
  for (const entry of entries) {
    const normalized = normalizeSlotEntry(entry);
    if (!normalized) {
      continue;
    }

    const key = [
      normalized.typeId,
      normalized.chargeTypeId ?? 0,
      normalized.chargeQuantity ?? 0
    ].join(":");

    const previous = grouped.get(key);
    if (previous) {
      previous.quantity += normalized.quantity;
    } else {
      grouped.set(key, normalized);
    }
  }

  return [...grouped.values()].sort(compareSlotEntries);
}

function normalizeSlotEntry(entry) {
  const typeId = parsePositiveInteger(entry?.typeId);
  const quantity = parsePositiveInteger(entry?.quantity);
  if (!typeId || !quantity) {
    return null;
  }

  const chargeTypeId = parsePositiveInteger(entry?.chargeTypeId);
  const chargeQuantity = parsePositiveInteger(entry?.chargeQuantity);

  if ((chargeTypeId && !chargeQuantity) || (!chargeTypeId && chargeQuantity)) {
    return {
      typeId,
      quantity
    };
  }

  return {
    typeId,
    quantity,
    ...(chargeTypeId ? { chargeTypeId } : {}),
    ...(chargeQuantity ? { chargeQuantity } : {})
  };
}

function compareSlotEntries(left, right) {
  if (left.typeId !== right.typeId) {
    return left.typeId - right.typeId;
  }

  const leftChargeTypeId = left.chargeTypeId ?? 0;
  const rightChargeTypeId = right.chargeTypeId ?? 0;
  if (leftChargeTypeId !== rightChargeTypeId) {
    return leftChargeTypeId - rightChargeTypeId;
  }

  const leftChargeQuantity = left.chargeQuantity ?? 0;
  const rightChargeQuantity = right.chargeQuantity ?? 0;
  if (leftChargeQuantity !== rightChargeQuantity) {
    return leftChargeQuantity - rightChargeQuantity;
  }

  return left.quantity - right.quantity;
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}
