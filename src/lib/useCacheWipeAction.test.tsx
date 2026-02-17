/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCacheWipeAction } from "./useCacheWipeAction";

describe("useCacheWipeAction", () => {
  it("clears cache, posts notice, logs, and reapplies trimmed last paste payload", async () => {
    const clearCache = vi.fn(async () => undefined);
    const logDebug = vi.fn();
    const setNetworkNotice = vi.fn();
    const clearPilotCards = vi.fn();
    const applyPaste = vi.fn();

    const { result } = renderHook(() =>
      useCacheWipeAction({
        clearCache,
        logDebug,
        setNetworkNotice,
        clearPilotCards,
        applyPaste,
        lastPasteRaw: "  Pilot A  ",
        manualEntry: " Pilot B "
      })
    );

    await act(async () => {
      await result.current();
    });

    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(logDebug).toHaveBeenCalledWith("Cache wiped by user");
    expect(setNetworkNotice).toHaveBeenCalledWith("Cache wiped.");
    expect(applyPaste).toHaveBeenCalledWith("Pilot A");
    expect(clearPilotCards).not.toHaveBeenCalled();
  });

  it("falls back to manual entry when last paste is empty", async () => {
    const clearCache = vi.fn(async () => undefined);
    const applyPaste = vi.fn();
    const { result } = renderHook(() =>
      useCacheWipeAction({
        clearCache,
        logDebug: vi.fn(),
        setNetworkNotice: vi.fn(),
        clearPilotCards: vi.fn(),
        applyPaste,
        lastPasteRaw: "",
        manualEntry: "  Pilot B  "
      })
    );

    await act(async () => {
      await result.current();
    });

    expect(applyPaste).toHaveBeenCalledWith("Pilot B");
  });

  it("clears pilot cards when no cached/manual payload exists", async () => {
    const clearCache = vi.fn(async () => undefined);
    const applyPaste = vi.fn();
    const clearPilotCards = vi.fn();
    const { result } = renderHook(() =>
      useCacheWipeAction({
        clearCache,
        logDebug: vi.fn(),
        setNetworkNotice: vi.fn(),
        clearPilotCards,
        applyPaste,
        lastPasteRaw: " ",
        manualEntry: ""
      })
    );

    await act(async () => {
      await result.current();
    });

    expect(applyPaste).not.toHaveBeenCalled();
    expect(clearPilotCards).toHaveBeenCalledTimes(1);
  });
});
