import type { ZkillKillmail } from "../api/zkill";
import type { FitResolvedSlots } from "../dogma/types";
import type { FitCandidate, FitEftSections, ShipPrediction } from "../intel";

type LossItem = {
  item_type_id: number;
  flag?: number;
  charge_item_type_id?: number;
  quantity_destroyed?: number;
  quantity_dropped?: number;
};

type PreparedItem = {
  item_type_id: number;
  flag?: number;
  charge_item_type_id?: number;
  quantity?: number;
};

export function deriveFitCandidates(params: {
  characterId: number;
  losses: ZkillKillmail[];
  predictedShips: ShipPrediction[];
  itemNamesByTypeId: Map<number, string>;
  onFitDebug?: (entry: {
    shipTypeId: number;
    sourceLossKillmailId: number;
    totalItems: number;
    fittedFlagItems: number;
    selectedSlots: number;
    droppedAsChargeLike: number;
  }) => void;
}): FitCandidate[] {
  const byShip = new Map<number, Map<string, {
    count: number;
    sections: FitEftSections;
    modulesBySlot: FitResolvedSlots;
    label: string;
    sourceLossKillmailId?: number;
  }>>();

  for (const ship of params.predictedShips) {
    if (!ship.shipTypeId) {
      continue;
    }
    byShip.set(
      ship.shipTypeId,
      new Map<
        string,
        {
          count: number;
          sections: FitEftSections;
          modulesBySlot: FitResolvedSlots;
          label: string;
          sourceLossKillmailId?: number;
        }
      >()
    );
  }

  for (const loss of params.losses) {
    const shipTypeId = loss.victim.ship_type_id;
    if (!shipTypeId || loss.victim.character_id !== params.characterId || !byShip.has(shipTypeId)) {
      continue;
    }

    const rawItems = loss.victim.items ?? [];
    if (rawItems.length === 0) {
      continue;
    }

    const prepared = prepareFittedItems(rawItems, params.itemNamesByTypeId);
    const items = prepared.selected;
    if (items.length === 0) {
      continue;
    }
    params.onFitDebug?.({
      shipTypeId,
      sourceLossKillmailId: loss.killmail_id,
      totalItems: rawItems.length,
      fittedFlagItems: prepared.fittedFlagItems,
      selectedSlots: prepared.selected.length,
      droppedAsChargeLike: prepared.droppedAsChargeLike
    });

    const sections = buildEftSections(items, params.itemNamesByTypeId);
    const modulesBySlot = buildResolvedSlots(items, params.itemNamesByTypeId);
    const moduleTokens = flattenFittedSections(sections);
    if (moduleTokens.length === 0) {
      continue;
    }
    const signature = moduleTokens.slice().sort((a, b) => a.localeCompare(b)).join(" | ");
    const label = moduleTokens.slice(0, 4).join(" | ");
    const shipFits = byShip.get(shipTypeId)!;
    const current = shipFits.get(signature);
    if (current) {
      current.count += 1;
      shipFits.set(signature, current);
    } else {
      shipFits.set(signature, {
        count: 1,
        sections,
        modulesBySlot,
        label,
        sourceLossKillmailId: loss.killmail_id
      });
    }
  }

  const fits: FitCandidate[] = [];
  for (const [shipTypeId, signatures] of byShip.entries()) {
    const total = [...signatures.values()].reduce((acc, value) => acc + value.count, 0);
    if (total <= 0) {
      continue;
    }
    const ranked = [...signatures.values()].sort((a, b) => b.count - a.count);
    const best = ranked[0];
    const alternates = ranked.slice(1, 3).map((entry) => ({
      fitLabel: entry.label,
      confidence: Number(((entry.count / total) * 100).toFixed(1))
    }));
    fits.push({
      shipTypeId,
      fitLabel: best.label,
      confidence: Number(((best.count / total) * 100).toFixed(1)),
      eftSections: best.sections,
      modulesBySlot: best.modulesBySlot,
      sourceLossKillmailId: best.sourceLossKillmailId,
      alternates
    });
  }

  return fits;
}

function buildEftSections(items: PreparedItem[], namesByTypeId: Map<number, string>): FitEftSections {
  const sections: FitEftSections = {
    high: [],
    mid: [],
    low: [],
    rig: [],
    cargo: [],
    other: []
  };

  for (const item of items) {
    const moduleName = namesByTypeId.get(item.item_type_id) ?? `Type ${item.item_type_id}`;
    const chargeName =
      item.charge_item_type_id !== undefined
        ? namesByTypeId.get(item.charge_item_type_id) ?? `Type ${item.charge_item_type_id}`
        : undefined;
    const displayNameBase = chargeName ? `${moduleName},${chargeName}` : moduleName;
    const slot = slotFromFlag(item.flag);
    const displayName =
      slot === "other" && item.quantity !== undefined && item.quantity > 1
        ? `${displayNameBase} x${item.quantity}`
        : displayNameBase;
    sections[slot].push(displayName);
  }

  return {
    high: sortAlpha(sections.high),
    mid: sortAlpha(sections.mid),
    low: sortAlpha(sections.low),
    rig: sortAlpha(sections.rig),
    cargo: sortAlpha(sections.cargo),
    other: sortAlpha(sections.other)
  };
}

function buildResolvedSlots(items: PreparedItem[], namesByTypeId: Map<number, string>): FitResolvedSlots {
  const slots: FitResolvedSlots = {
    high: [],
    mid: [],
    low: [],
    rig: [],
    cargo: [],
    other: []
  };

  for (const item of items) {
    const slot = slotFromFlag(item.flag);
    slots[slot].push({
      typeId: item.item_type_id,
      name: namesByTypeId.get(item.item_type_id) ?? `Type ${item.item_type_id}`,
      flag: item.flag,
      chargeTypeId: item.charge_item_type_id,
      chargeName:
        item.charge_item_type_id !== undefined
          ? namesByTypeId.get(item.charge_item_type_id) ?? `Type ${item.charge_item_type_id}`
          : undefined,
      quantity: item.quantity
    });
  }

  return {
    high: sortResolved(slots.high),
    mid: sortResolved(slots.mid),
    low: sortResolved(slots.low),
    rig: sortResolved(slots.rig),
    cargo: sortResolved(slots.cargo),
    other: sortResolved(slots.other)
  };
}

function flattenFittedSections(sections: FitEftSections): string[] {
  return [...sections.high, ...sections.mid, ...sections.low, ...sections.rig];
}

export function slotFromFlag(flag?: number): keyof FitEftSections {
  if (flag === undefined) {
    return "other";
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
  if (flag === 5) {
    return "cargo";
  }
  return "other";
}

function isFittedSlotFlag(flag?: number): boolean {
  if (flag === undefined) {
    return false;
  }
  return (
    (flag >= 11 && flag <= 34) || // low / mid / high
    (flag >= 92 && flag <= 99) || // rigs
    (flag >= 125 && flag <= 132) // subsystem slots
  );
}

export function prepareFittedItems(
  items: LossItem[],
  namesByTypeId: Map<number, string>
): {
  selected: PreparedItem[];
  fittedFlagItems: number;
  droppedAsChargeLike: number;
} {
  const byFlag = new Map<number, Array<{ item_type_id: number; flag?: number; charge_item_type_id?: number }>>();
  let fittedFlagItems = 0;
  for (const item of items) {
    if (!isFittedSlotFlag(item.flag)) {
      continue;
    }
    fittedFlagItems += 1;
    const flag = item.flag!;
    const rows = byFlag.get(flag) ?? [];
    rows.push(item);
    byFlag.set(flag, rows);
  }

  let droppedAsChargeLike = 0;
  const selected: PreparedItem[] = [...byFlag.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, candidates]) => {
      const preferred = candidates.find((candidate) => {
        const name = namesByTypeId.get(candidate.item_type_id) ?? "";
        return !isChargeLikeName(name);
      });
      const module = preferred ?? candidates[0];
      const moduleName = namesByTypeId.get(module.item_type_id) ?? "";
      const chargeCandidates = candidates.filter((candidate) => {
        if (candidate.item_type_id === module.item_type_id) {
          return false;
        }
        const name = namesByTypeId.get(candidate.item_type_id) ?? "";
        return isChargeLikeName(name) && !isChargeLikeName(moduleName);
      });
      const chargeCandidate = pickCompatibleChargeCandidate(moduleName, chargeCandidates, namesByTypeId);
      droppedAsChargeLike += Math.max(0, candidates.length - 1);
      return {
        item_type_id: module.item_type_id,
        flag: module.flag,
        charge_item_type_id: module.charge_item_type_id ?? chargeCandidate?.item_type_id
      };
    });

  const droneBayItems = items
    .filter((item) => item.flag === 87)
    .map((item) => ({
      item_type_id: item.item_type_id,
      flag: item.flag,
      quantity: Math.max(1, item.quantity_destroyed ?? item.quantity_dropped ?? 1)
    }));

  selected.push(...droneBayItems);
  return { selected, fittedFlagItems, droppedAsChargeLike };
}

function isChargeLikeName(name: string): boolean {
  const normalized = name.toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("launcher")) {
    return false;
  }
  if (normalized.includes("missile guidance")) {
    return false;
  }
  if (/\b(?:missile|rocket|torpedo)\s+bay\b/.test(normalized)) {
    return false;
  }
  if (normalized.includes("artillery") && normalized.includes("probe")) {
    return false;
  }
  return (
    normalized.includes(" charge") ||
    normalized.includes("script") ||
    normalized.includes("ammo") ||
    normalized.includes("missile") ||
    normalized.includes("rocket") ||
    normalized.includes("torpedo") ||
    normalized.includes("bomb") ||
    normalized.includes("probe") ||
    normalized.includes("nanite repair paste") ||
    /\b(?:s|m|l|xl)\b$/.test(normalized)
  );
}

function pickCompatibleChargeCandidate(
  moduleName: string,
  chargeCandidates: Array<{ item_type_id: number; flag?: number }>,
  namesByTypeId: Map<number, string>
): { item_type_id: number; flag?: number } | undefined {
  if (chargeCandidates.length === 0) {
    return undefined;
  }

  const module = moduleName.toLowerCase();
  const candidates = chargeCandidates.map((candidate) => ({
    row: candidate,
    name: (namesByTypeId.get(candidate.item_type_id) ?? "").toLowerCase()
  }));

  if (module.includes("interdiction sphere launcher")) {
    return candidates.find((candidate) => candidate.name.includes("probe"))?.row ?? candidates[0].row;
  }

  if (/(blaster|railgun|particle accelerator|autocannon|artillery|beam|pulse|laser|disintegrator)/i.test(module)) {
    const ammo = candidates.find((candidate) => !candidate.name.includes("probe") && !candidate.name.includes("script"));
    return ammo?.row;
  }

  if (/(missile launcher|rocket launcher|torpedo launcher|heavy assault launcher)/i.test(module)) {
    const ammo = candidates.find(
      (candidate) =>
        candidate.name.includes("missile") ||
        candidate.name.includes("rocket") ||
        candidate.name.includes("torpedo")
    );
    return ammo?.row ?? candidates.find((candidate) => !candidate.name.includes("probe"))?.row;
  }

  if (/(warp disruptor|warp scrambler|stasis webifier|tracking computer|tracking disruptor)/i.test(module)) {
    const script = candidates.find((candidate) => candidate.name.includes("script"));
    return script?.row;
  }

  return candidates[0].row;
}

function sortAlpha(values: string[]): string[] {
  return values.slice().sort((a, b) => a.localeCompare(b));
}

function sortResolved(values: Array<{ typeId: number; name: string; flag?: number }>) {
  return values.slice().sort((a, b) => a.name.localeCompare(b.name));
}
