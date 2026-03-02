/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useManualEntryHandlers } from "./useManualEntryHandlers";

describe("useManualEntryHandlers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("owns manual-entry callbacks directly with stable change-handler identity", () => {
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
    const firstChange = result.current.onManualEntryChange;
    const firstSubmit = result.current.onManualEntrySubmit;

    act(() => {
      result.current.onManualEntryChange("Pilot B");
      result.current.onManualEntrySubmit();
    });

    rerender({ manualEntry: "Pilot C" });
    act(() => {
      result.current.onManualEntrySubmit();
    });

    expect(result.current.onManualEntryChange).toBe(firstChange);
    expect(result.current.onManualEntrySubmit).not.toBe(firstSubmit);
    expect(setManualEntry).toHaveBeenCalledTimes(1);
    expect(setManualEntry).toHaveBeenCalledWith("Pilot B");
    expect(applyPaste).toHaveBeenCalledTimes(2);
    expect(applyPaste).toHaveBeenNthCalledWith(1, "Pilot A");
    expect(applyPaste).toHaveBeenNthCalledWith(2, "Pilot C");
  });
});
