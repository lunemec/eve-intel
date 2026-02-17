/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDebugLog } from "./useDebugLog";

describe("useDebugLog", () => {
  it("formats and stores debug lines with serialized payload suffix", () => {
    const { result } = renderHook(({ debugEnabled }) => useDebugLog({ debugEnabled }), {
      initialProps: { debugEnabled: false }
    });

    act(() => {
      result.current.logDebug("hello", { x: 1 });
    });

    expect(result.current.debugLines.length).toBe(1);
    expect(result.current.debugLines[0]).toContain("hello | {\"x\":1}");
  });

  it("writes to console only when debug mode is enabled", () => {
    const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const { result, rerender } = renderHook(({ debugEnabled }) => useDebugLog({ debugEnabled }), {
      initialProps: { debugEnabled: false }
    });

    act(() => {
      result.current.logDebug("off");
    });
    expect(consoleSpy).toHaveBeenCalledTimes(0);

    rerender({ debugEnabled: true });
    act(() => {
      result.current.logDebug("on");
    });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it("caps retained debug lines to the most recent 250 entries", () => {
    const { result } = renderHook(() => useDebugLog({ debugEnabled: false }));

    act(() => {
      for (let i = 0; i < 260; i += 1) {
        result.current.logDebug(`msg-${i}`);
      }
    });

    expect(result.current.debugLines.length).toBe(250);
    expect(result.current.debugLines[0]).toContain("msg-259");
    expect(result.current.debugLines[249]).toContain("msg-10");
  });

  it("keeps logDebug callback stable when debugEnabled does not change", () => {
    const { result, rerender } = renderHook(({ debugEnabled }) => useDebugLog({ debugEnabled }), {
      initialProps: { debugEnabled: false }
    });
    const first = result.current.logDebug;

    rerender({ debugEnabled: false });
    expect(result.current.logDebug).toBe(first);
  });
});
