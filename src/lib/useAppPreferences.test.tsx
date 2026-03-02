/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "./useAppPreferences";
import {
  loadDebugEnabled,
  loadSettings,
  persistDebugEnabled,
  persistSettings
} from "./settings";

vi.mock("./settings", async () => {
  const actual = await vi.importActual<typeof import("./settings")>("./settings");
  return {
    ...actual,
    loadSettings: vi.fn(),
    loadDebugEnabled: vi.fn(),
    persistSettings: vi.fn(),
    persistDebugEnabled: vi.fn()
  };
});

describe("useAppPreferences", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("owns settings/debug persistence flow directly", () => {
    vi.mocked(loadSettings).mockReturnValue({ lookbackDays: 7 });
    vi.mocked(loadDebugEnabled).mockReturnValue(false);

    const { result } = renderHook(() => useAppPreferences({ maxLookbackDays: 14 }));

    expect(loadSettings).toHaveBeenCalledWith(localStorage, 14);
    expect(loadDebugEnabled).toHaveBeenCalledWith(localStorage);
    expect(result.current.settings).toEqual({ lookbackDays: 7 });
    expect(result.current.debugEnabled).toBe(false);
    expect(persistSettings).toHaveBeenCalledWith(localStorage, { lookbackDays: 7 });
    expect(persistDebugEnabled).toHaveBeenCalledWith(localStorage, false);
  });

  it("keeps debug toggle callback stable while persisting toggled value", () => {
    vi.mocked(loadSettings).mockReturnValue({ lookbackDays: 5 });
    vi.mocked(loadDebugEnabled).mockReturnValue(false);

    const { result, rerender } = renderHook(
      ({ maxLookbackDays }) =>
        useAppPreferences({
          maxLookbackDays
        }),
      {
        initialProps: {
          maxLookbackDays: 30
        }
      }
    );
    const firstToggle = result.current.onDebugToggle;

    act(() => {
      result.current.onDebugToggle(true);
    });
    rerender({
      maxLookbackDays: 90
    });

    expect(result.current.onDebugToggle).toBe(firstToggle);
    expect(result.current.debugEnabled).toBe(true);
    expect(persistDebugEnabled).toHaveBeenLastCalledWith(localStorage, true);
  });
});
