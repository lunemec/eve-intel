import type { Settings } from "../types";

export const SETTINGS_KEY = "eve-intel.settings.v1";
export const DEBUG_KEY = "eve-intel.debug-enabled.v1";

export function DEFAULT_SETTINGS(maxLookbackDays: number): Settings {
  return { lookbackDays: maxLookbackDays };
}

export function normalizeLookbackDays(value: unknown, maxLookbackDays: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return maxLookbackDays;
  }
  return Math.min(maxLookbackDays, Math.max(1, Math.floor(value)));
}

export function loadSettings(storage: Pick<Storage, "getItem">, maxLookbackDays: number): Settings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS(maxLookbackDays);
    }

    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      lookbackDays: normalizeLookbackDays(parsed.lookbackDays, maxLookbackDays)
    };
  } catch {
    return DEFAULT_SETTINGS(maxLookbackDays);
  }
}

export function persistSettings(storage: Pick<Storage, "setItem">, settings: Settings): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures; app still works with in-memory settings.
  }
}

export function loadDebugEnabled(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistDebugEnabled(storage: Pick<Storage, "setItem">, enabled: boolean): void {
  try {
    storage.setItem(DEBUG_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}
