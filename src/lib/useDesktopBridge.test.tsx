/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDesktopBridge } from "./useDesktopBridge";

describe("useDesktopBridge", () => {
  afterEach(() => {
    delete window.eveIntelDesktop;
  });

  it("wires desktop subscriptions and dedupes updater logs", async () => {
    const applyPaste = vi.fn();
    const logDebug = vi.fn();
    const unsubscribeClipboard = vi.fn();
    const unsubscribeWindow = vi.fn();
    const unsubscribeUpdater = vi.fn();
    let clipboardCb: ((text: string) => void) | null = null;
    let windowCb: ((maximized: boolean) => void) | null = null;
    let updaterCb: ((state: DesktopUpdaterState) => void) | null = null;

    window.eveIntelDesktop = {
      onClipboardText: vi.fn((cb: (text: string) => void) => {
        clipboardCb = cb;
        return unsubscribeClipboard;
      }),
      minimizeWindow: vi.fn(async () => undefined),
      toggleMaximizeWindow: vi.fn(async () => false),
      closeWindow: vi.fn(async () => undefined),
      isWindowMaximized: vi.fn(async () => true),
      onWindowMaximized: vi.fn((cb: (maximized: boolean) => void) => {
        windowCb = cb;
        return unsubscribeWindow;
      }),
      onUpdaterState: vi.fn((cb: (state: DesktopUpdaterState) => void) => {
        updaterCb = cb;
        return unsubscribeUpdater;
      }),
      checkForUpdates: vi.fn(async () => ({ ok: true })),
      quitAndInstallUpdate: vi.fn(async () => true)
    };

    const { result, unmount } = renderHook(() => useDesktopBridge({ applyPaste, logDebug }));
    await waitFor(() => expect(result.current.isWindowMaximized).toBe(true));

    act(() => {
      clipboardCb?.("Pilot A");
      windowCb?.(false);
      updaterCb?.({
        status: "checking",
        progress: 0,
        version: "1.0.0",
        availableVersion: null,
        downloadedVersion: null,
        error: null,
        errorDetails: null
      });
      updaterCb?.({
        status: "checking",
        progress: 0,
        version: "1.0.0",
        availableVersion: null,
        downloadedVersion: null,
        error: null,
        errorDetails: null
      });
    });

    expect(result.current.isDesktopApp).toBe(true);
    expect(result.current.isWindowMaximized).toBe(false);
    expect(applyPaste).toHaveBeenCalledWith("Pilot A");
    expect(logDebug).toHaveBeenCalledWith("Desktop clipboard update received");
    expect(logDebug).toHaveBeenCalledWith("Updater state", {
      status: "checking",
      progress: 0,
      availableVersion: null,
      downloadedVersion: null
    });
    expect(logDebug).toHaveBeenCalledTimes(2);

    unmount();
    expect(unsubscribeClipboard).toHaveBeenCalledTimes(1);
    expect(unsubscribeWindow).toHaveBeenCalledTimes(1);
    expect(unsubscribeUpdater).toHaveBeenCalledTimes(1);
  });
});
