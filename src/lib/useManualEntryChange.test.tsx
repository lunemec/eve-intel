/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useManualEntryChange } from "./useManualEntryChange";

describe("useManualEntryChange", () => {
  it("forwards changed manual entry value to setter", () => {
    const setManualEntry = vi.fn();
    const { result } = renderHook(() => useManualEntryChange({ setManualEntry }));

    act(() => {
      result.current("Pilot A");
    });

    expect(setManualEntry).toHaveBeenCalledTimes(1);
    expect(setManualEntry).toHaveBeenCalledWith("Pilot A");
  });
});
