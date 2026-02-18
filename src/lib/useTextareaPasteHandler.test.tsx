/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTextareaPasteHandler } from "./useTextareaPasteHandler";

describe("useTextareaPasteHandler", () => {
  it("applies clipboard text when present", () => {
    const applyPaste = vi.fn();
    const { result } = renderHook(() => useTextareaPasteHandler({ applyPaste }));

    act(() => {
      result.current({
        clipboardData: {
          getData: () => "Pilot A"
        }
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    });

    expect(applyPaste).toHaveBeenCalledWith("Pilot A");
  });

  it("ignores empty and missing clipboard payloads", () => {
    const applyPaste = vi.fn();
    const { result } = renderHook(() => useTextareaPasteHandler({ applyPaste }));

    act(() => {
      result.current({
        clipboardData: {
          getData: () => ""
        }
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
      result.current({} as React.ClipboardEvent<HTMLTextAreaElement>);
    });

    expect(applyPaste).not.toHaveBeenCalled();
  });
});
