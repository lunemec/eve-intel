/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useManualEntrySubmit } from "./useManualEntrySubmit";

describe("useManualEntrySubmit", () => {
  it("submits current manual entry through applyPaste", () => {
    const applyPaste = vi.fn();
    const { result } = renderHook(() =>
      useManualEntrySubmit({
        manualEntry: " Pilot A ",
        applyPaste
      })
    );

    act(() => {
      result.current();
    });

    expect(applyPaste).toHaveBeenCalledTimes(1);
    expect(applyPaste).toHaveBeenCalledWith(" Pilot A ");
  });

  it("uses latest manual entry after rerender", () => {
    const applyPaste = vi.fn();
    const { result, rerender } = renderHook(
      ({ manualEntry }) =>
        useManualEntrySubmit({
          manualEntry,
          applyPaste
        }),
      { initialProps: { manualEntry: "old" } }
    );

    rerender({ manualEntry: "new" });
    act(() => {
      result.current();
    });

    expect(applyPaste).toHaveBeenCalledTimes(1);
    expect(applyPaste).toHaveBeenCalledWith("new");
  });
});
