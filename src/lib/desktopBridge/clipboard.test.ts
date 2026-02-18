import { describe, expect, it, vi } from "vitest";
import { bindDesktopClipboard } from "./clipboard";

describe("desktopBridge/clipboard", () => {
  it("binds desktop clipboard callback and logs/apply pasted text", () => {
    const applyPaste = vi.fn();
    const logDebug = vi.fn();
    const callbacks: Array<(text: string) => void> = [];
    const unsubscribe = vi.fn();
    const desktop = {
      onClipboardText: (cb: (text: string) => void) => {
        callbacks.push(cb);
        return unsubscribe;
      }
    } as unknown as Window["eveIntelDesktop"];

    const detach = bindDesktopClipboard(desktop, { applyPaste, logDebug });
    callbacks[0]?.("Pilot A");

    expect(detach).toBe(unsubscribe);
    expect(applyPaste).toHaveBeenCalledWith("Pilot A");
    expect(logDebug).toHaveBeenCalledWith("Desktop clipboard update received");
  });

  it("returns undefined when desktop bridge is unavailable", () => {
    expect(bindDesktopClipboard(undefined, { applyPaste: vi.fn(), logDebug: vi.fn() })).toBeUndefined();
  });
});
