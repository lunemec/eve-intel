/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useManualEntryHandlers } from "./useManualEntryHandlers";

describe("useManualEntryHandlers", () => {
  it("exposes change and submit callbacks with current manual entry", () => {
    const setManualEntry = vi.fn();
    const applyPaste = vi.fn();
    const { result, rerender } = renderHook(
      ({ manualEntry }) =>
        useManualEntryHandlers({
          manualEntry,
          setManualEntry,
          applyPaste
        }),
      { initialProps: { manualEntry: "Pilot A" } }
    );

    act(() => {
      result.current.onManualEntryChange("Pilot B");
      result.current.onManualEntrySubmit();
    });

    rerender({ manualEntry: "Pilot C" });
    act(() => {
      result.current.onManualEntrySubmit();
    });

    expect(setManualEntry).toHaveBeenCalledTimes(1);
    expect(setManualEntry).toHaveBeenCalledWith("Pilot B");
    expect(applyPaste).toHaveBeenCalledTimes(2);
    expect(applyPaste).toHaveBeenNthCalledWith(1, "Pilot A");
    expect(applyPaste).toHaveBeenNthCalledWith(2, "Pilot C");
  });
});
