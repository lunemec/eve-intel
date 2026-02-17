/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadDebugEnabled,
  loadSettings,
  normalizeLookbackDays,
  persistDebugEnabled,
  persistSettings
} from "./settings";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    }
  };
}

describe("settings", () => {
  it("loads persisted lookbackDays", () => {
    const storage = createMemoryStorage();
    storage.setItem("eve-intel.settings.v1", JSON.stringify({ lookbackDays: 3 }));

    expect(loadSettings(storage, 7)).toEqual({ lookbackDays: 3 });
  });

  it("falls back to defaults for invalid payloads", () => {
    const storage = createMemoryStorage();
    storage.setItem("eve-intel.settings.v1", "{invalid");

    expect(loadSettings(storage, 7)).toEqual(DEFAULT_SETTINGS(7));
  });

  it("clamps lookbackDays to valid bounds", () => {
    expect(normalizeLookbackDays(0, 7)).toBe(1);
    expect(normalizeLookbackDays(999, 7)).toBe(7);
    expect(normalizeLookbackDays(4.9, 7)).toBe(4);
    expect(normalizeLookbackDays("x", 7)).toBe(7);
  });

  it("persists settings and debug flag values", () => {
    const storage = createMemoryStorage();
    persistSettings(storage, { lookbackDays: 5 });
    persistDebugEnabled(storage, true);

    expect(JSON.parse(storage.getItem("eve-intel.settings.v1") ?? "{}")).toEqual({ lookbackDays: 5 });
    expect(storage.getItem("eve-intel.debug-enabled.v1")).toBe("1");
    expect(loadDebugEnabled(storage)).toBe(true);
  });
});
