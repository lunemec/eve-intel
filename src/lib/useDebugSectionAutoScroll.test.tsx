/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDebugSectionAutoScroll } from "./useDebugSectionAutoScroll";

describe("useDebugSectionAutoScroll", () => {
  it("scrolls debug section into view when enabled", () => {
    const scrollIntoView = vi.fn();
    const ref = {
      current: {
        scrollIntoView
      }
    } as unknown as React.RefObject<HTMLElement>;

    renderHook(() => useDebugSectionAutoScroll({ debugEnabled: true, debugSectionRef: ref }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does not scroll when disabled and scrolls after enabling", () => {
    const scrollIntoView = vi.fn();
    const ref = {
      current: {
        scrollIntoView
      }
    } as unknown as React.RefObject<HTMLElement>;

    const { rerender } = renderHook(
      ({ debugEnabled }) => useDebugSectionAutoScroll({ debugEnabled, debugSectionRef: ref }),
      { initialProps: { debugEnabled: false } }
    );

    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender({ debugEnabled: true });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
