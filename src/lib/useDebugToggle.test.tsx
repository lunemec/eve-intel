/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDebugToggle } from "./useDebugToggle";

describe("useDebugToggle", () => {
  it("forwards toggled value to debug setter", () => {
    const setDebugEnabled = vi.fn();
    const { result } = renderHook(() => useDebugToggle({ setDebugEnabled }));

    act(() => {
      result.current(true);
      result.current(false);
    });

    expect(setDebugEnabled).toHaveBeenCalledTimes(2);
    expect(setDebugEnabled).toHaveBeenNthCalledWith(1, true);
    expect(setDebugEnabled).toHaveBeenNthCalledWith(2, false);
  });
});
