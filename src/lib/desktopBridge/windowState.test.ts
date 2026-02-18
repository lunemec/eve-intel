import { describe, expect, it, vi } from "vitest";
import { bindWindowMaximizedListener } from "./windowState";

describe("desktopBridge/windowState", () => {
  it("hydrates initial state and subscribes to updates", async () => {
    const onState = vi.fn();
    const callbacks: Array<(value: boolean) => void> = [];
    const unsubscribe = vi.fn();
    const desktop = {
      isWindowMaximized: vi.fn(async () => true),
      onWindowMaximized: vi.fn((cb: (value: boolean) => void) => {
        callbacks.push(cb);
        return unsubscribe;
      })
    } as unknown as Window["eveIntelDesktop"];

    const detach = bindWindowMaximizedListener(desktop, onState);
    await Promise.resolve();
    callbacks[0]?.(false);

    expect(onState).toHaveBeenNthCalledWith(1, true);
    expect(onState).toHaveBeenNthCalledWith(2, false);
    expect(detach).toBeTypeOf("function");
    detach?.();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
