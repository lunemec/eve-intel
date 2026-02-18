import { getType, resolveTypeIdByName, type DogmaIndex } from "../index";
import type { FitResolvedModule, FitResolvedSlots } from "../types";

export type ParsedEftFit = {
  shipTypeId: number;
  shipName: string;
  slots: FitResolvedSlots;
  drones: FitResolvedModule[];
  unknownLines: string[];
};

export function parseEftToResolvedFit(index: DogmaIndex, eft: string): ParsedEftFit {
  const lines = eft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0 || !lines[0].startsWith("[")) {
    throw new Error("Invalid EFT fit header");
  }

  const header = lines[0].replace(/^\[/, "").replace(/\]$/, "");
  const [shipNameRaw] = header.split(",", 2);
  const shipName = shipNameRaw.trim();
  const shipTypeId = resolveTypeIdByName(index, shipName);
  if (shipTypeId === undefined) {
    throw new Error(`Unknown ship in EFT header: ${shipName}`);
  }

  const slots: FitResolvedSlots = {
    high: [],
    mid: [],
    low: [],
    rig: [],
    cargo: [],
    other: []
  };
  const drones: FitResolvedModule[] = [];
  const unknownLines: string[] = [];

  let section: keyof FitResolvedSlots | "drones" = "high";
  for (const line of lines.slice(1)) {
    const sectionHeading = parseSectionHeading(line);
    if (sectionHeading) {
      section = sectionHeading;
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      continue;
    }
    if (line.toLowerCase() === "cargo") {
      section = "cargo";
      continue;
    }

    const parsed = parseModuleLine(line);
    if (!parsed) {
      unknownLines.push(line);
      continue;
    }

    const typeId = resolveTypeIdByFlexibleName(index, parsed.moduleName);
    if (typeId === undefined) {
      unknownLines.push(line);
      continue;
    }

    const entry: FitResolvedModule = {
      typeId,
      name: parsed.moduleName,
      quantity: parsed.quantity
    };

    if (parsed.chargeName) {
      const chargeTypeId = resolveTypeIdByFlexibleName(index, parsed.chargeName);
      if (chargeTypeId !== undefined) {
        entry.chargeTypeId = chargeTypeId;
        entry.chargeName = parsed.chargeName;
      }
    }

    const type = getType(index, typeId);
    const categoryId = Number(type?.categoryId ?? 0);
    if (categoryId === 18) {
      // EFT drone-bay entries do not encode launched/active state.
      // Treat them as bay inventory for parity unless explicitly modeled elsewhere.
      slots.cargo.push(entry);
      section = "drones";
      continue;
    }
    if (categoryId === 32) {
      // Strategic cruiser subsystems and similar non-power-slot modules.
      slots.other.push(entry);
      continue;
    }
    if (section === "cargo") {
      slots.cargo.push(entry);
      continue;
    }
    if (section === "other") {
      slots.other.push(entry);
      continue;
    }

    const guessed = guessSlot(type, section);
    slots[guessed].push(entry);
  }

  return { shipTypeId, shipName, slots, drones, unknownLines };
}

function parseModuleLine(line: string): { moduleName: string; chargeName?: string; quantity?: number } | null {
  if (!line || /^\[empty .*slot\]$/i.test(line)) {
    return null;
  }
  const qtyMatch = line.match(/\s+x(\d+)$/i);
  const quantity = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : undefined;
  const withoutQty = qtyMatch ? line.slice(0, qtyMatch.index).trim() : line;

  const [modulePart, chargePart] = withoutQty.split(",", 2).map((s) => s.trim());
  if (!modulePart) {
    return null;
  }
  return {
    moduleName: modulePart,
    chargeName: chargePart || undefined,
    quantity
  };
}

function guessSlot(type: { groupId?: number; effects?: string[] } | undefined, fallback: keyof FitResolvedSlots | "drones"): keyof FitResolvedSlots {
  const groupId = type?.groupId;
  const highGroups = new Set([53, 55, 74, 483, 506]);
  const midGroups = new Set([38, 40, 46, 47, 52, 65, 76, 77, 762]);
  const lowGroups = new Set([59, 60, 61, 62, 63, 64, 98, 763]);
  const rigGroups = new Set([773, 774, 775, 776, 777, 778, 779, 786]);

  if (groupId && highGroups.has(groupId)) return "high";
  if (groupId && midGroups.has(groupId)) return "mid";
  if (groupId && lowGroups.has(groupId)) return "low";
  if (groupId && rigGroups.has(groupId)) return "rig";

  const effects = new Set((type?.effects ?? []).map((value) => value.toLowerCase()));
  if (effects.has("hipower")) return "high";
  if (effects.has("medpower")) return "mid";
  if (effects.has("lopower") || effects.has("lowpower")) return "low";
  if (effects.has("rigslot")) return "rig";

  if (fallback === "drones") return "cargo";
  return fallback;
}

function parseSectionHeading(line: string): keyof FitResolvedSlots | "drones" | undefined {
  const normalized = line.toLowerCase().replace(/:$/, "").trim();
  if (normalized === "high slots" || normalized === "high slot") return "high";
  if (normalized === "mid slots" || normalized === "mid slot" || normalized === "medium slots") return "mid";
  if (normalized === "low slots" || normalized === "low slot") return "low";
  if (normalized === "rig slots" || normalized === "rig slot") return "rig";
  if (normalized === "cargo" || normalized === "cargo hold") return "cargo";
  if (normalized === "drones" || normalized === "drone bay") return "drones";
  if (normalized === "subsystems" || normalized === "subsystem slots" || normalized === "subsystem slot") return "other";
  return undefined;
}

function resolveTypeIdByFlexibleName(index: DogmaIndex, name: string): number | undefined {
  const direct = resolveTypeIdByName(index, name);
  if (direct !== undefined) {
    return direct;
  }

  const aliasCandidates = buildAliasCandidates(name);
  for (const candidate of aliasCandidates) {
    const matched = resolveTypeIdByName(index, candidate);
    if (matched !== undefined) {
      return matched;
    }
  }

  const target = normalizeName(name);
  let best: { id: number; score: number } | undefined;
  for (const [lowerName, id] of index.typeIdByName.entries()) {
    const normalized = normalizeName(lowerName);
    const score = nameSimilarity(target, normalized);
    if (score < 0.62) {
      continue;
    }
    if (!best || score > best.score) {
      best = { id, score };
    }
  }
  return best?.id;
}

function buildAliasCandidates(name: string): string[] {
  const lower = name.trim().toLowerCase();
  const candidates: string[] = [];
  if (lower === "adaptive nano plating ii") {
    candidates.push("Multispectrum Coating II");
    candidates.push("Limited Adaptive Nano Plating I");
  }
  const antiPump = lower.match(/^(small|medium|large|capital)?\s*anti[-\s](em|thermal|kinetic|explosive)\s+pump\s+(i|ii)$/i);
  if (antiPump) {
    const size = (antiPump[1] ?? "small").toLowerCase();
    const damage = antiPump[2].toLowerCase();
    const tech = antiPump[3].toUpperCase();
    const d = damage === "thermal" ? "Thermal" : damage === "kinetic" ? "Kinetic" : damage === "explosive" ? "Explosive" : "EM";
    const s = size[0].toUpperCase() + size.slice(1);
    candidates.push(`${s} ${d} Armor Reinforcer ${tech}`);
  }
  return candidates;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/\b(ii|iii|iv|v)\b/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) {
    return 0;
  }
  let intersect = 0;
  for (const token of ta) {
    if (tb.has(token)) {
      intersect += 1;
    }
  }
  return intersect / Math.max(ta.size, tb.size);
}
