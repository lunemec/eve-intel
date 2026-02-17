/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDesktopWindowControls } from "./useDesktopWindowControls";

describe("useDesktopWindowControls", () => {
  afterEach(() => {
    delete window.eveIntelDesktop;
  });

  it("invokes desktop window methods when bridge is available", () => {
    const minimizeWindow = vi.fn(async () => undefined);
    const toggleMaximizeWindow = vi.fn(async () => true);
    const closeWindow = vi.fn(async () => undefined);
    const quitAndInstallUpdate = vi.fn(async () => true);
    window.eveIntelDesktop = {
      onClipboardText: vi.fn(() => () => undefined),
      minimizeWindow,
      toggleMaximizeWindow,
      closeWindow,
      isWindowMaximized: vi.fn(async () => false),
      onWindowMaximized: vi.fn(() => () => undefined),
      onUpdaterState: vi.fn(() => () => undefined),
      checkForUpdates: vi.fn(async () => ({ ok: true })),
      quitAndInstallUpdate
    } as Window["eveIntelDesktop"];
    const { result } = renderHook(() => useDesktopWindowControls());

    act(() => {
      result.current.onMinimize();
      result.current.onToggleMaximize();
      result.current.onClose();
      result.current.onRestartToUpdate();
    });

    expect(minimizeWindow).toHaveBeenCalledTimes(1);
    expect(toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(closeWindow).toHaveBeenCalledTimes(1);
    expect(quitAndInstallUpdate).toHaveBeenCalledTimes(1);
  });

  it("no-ops safely when desktop bridge is missing", () => {
    const { result } = renderHook(() => useDesktopWindowControls());

    expect(() => {
      act(() => {
        result.current.onMinimize();
        result.current.onToggleMaximize();
        result.current.onClose();
        result.current.onRestartToUpdate();
      });
    }).not.toThrow();
  });
});
