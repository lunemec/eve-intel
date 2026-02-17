/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "./useAppPreferences";
import { loadDebugEnabled, loadSettings } from "./settings";
import { usePersistedSettings } from "./usePersistedSettings";

vi.mock("./settings", async () => {
  const actual = await vi.importActual<typeof import("./settings")>("./settings");
  return {
    ...actual,
    loadSettings: vi.fn(),
    loadDebugEnabled: vi.fn()
  };
});

vi.mock("./usePersistedSettings", () => ({
  usePersistedSettings: vi.fn()
}));

describe("useAppPreferences", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads settings/debug defaults and wires persistence hook", () => {
    vi.mocked(loadSettings).mockReturnValue({ lookbackDays: 7 });
    vi.mocked(loadDebugEnabled).mockReturnValue(false);

    const { result } = renderHook(() => useAppPreferences({ maxLookbackDays: 14 }));

    expect(loadSettings).toHaveBeenCalledWith(localStorage, 14);
    expect(loadDebugEnabled).toHaveBeenCalledWith(localStorage);
    expect(result.current.settings).toEqual({ lookbackDays: 7 });
    expect(result.current.debugEnabled).toBe(false);
    expect(usePersistedSettings).toHaveBeenCalledWith({
      settings: { lookbackDays: 7 },
      debugEnabled: false
    });
  });

  it("updates debug toggle state and re-runs persisted preferences hook", () => {
    vi.mocked(loadSettings).mockReturnValue({ lookbackDays: 5 });
    vi.mocked(loadDebugEnabled).mockReturnValue(false);

    const { result } = renderHook(() => useAppPreferences({ maxLookbackDays: 30 }));

    act(() => {
      result.current.onDebugToggle(true);
    });

    expect(result.current.debugEnabled).toBe(true);
    expect(usePersistedSettings).toHaveBeenLastCalledWith({
      settings: { lookbackDays: 5 },
      debugEnabled: true
    });
  });
});
