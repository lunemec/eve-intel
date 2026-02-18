/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePasteInputIntegration } from "./usePasteInputIntegration";
import { useGlobalPasteTrap } from "./useGlobalPasteTrap";
import { useTextareaPasteHandler } from "./useTextareaPasteHandler";

vi.mock("./useGlobalPasteTrap", () => ({
  useGlobalPasteTrap: vi.fn()
}));

vi.mock("./useTextareaPasteHandler", () => ({
  useTextareaPasteHandler: vi.fn()
}));

describe("usePasteInputIntegration", () => {
  it("composes paste trap ref and textarea onPaste handler", () => {
    const applyPaste = vi.fn();
    const pasteTrapRef = { current: null } as React.RefObject<HTMLTextAreaElement>;
    const onPaste = vi.fn();
    vi.mocked(useGlobalPasteTrap).mockReturnValue(pasteTrapRef);
    vi.mocked(useTextareaPasteHandler).mockReturnValue(onPaste);

    const { result } = renderHook(() => usePasteInputIntegration({ applyPaste }));

    expect(useGlobalPasteTrap).toHaveBeenCalledWith({ applyPaste });
    expect(useTextareaPasteHandler).toHaveBeenCalledWith({ applyPaste });
    expect(result.current.pasteTrapRef).toBe(pasteTrapRef);
    expect(result.current.onPaste).toBe(onPaste);
  });
});
