/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePasteInputIntegration } from "./usePasteInputIntegration";

describe("usePasteInputIntegration", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("owns paste handlers directly and keeps callback identities stable", () => {
    const applyPaste = vi.fn();
    const { result, rerender } = renderHook(
      ({ applyPaste: callback }) =>
        usePasteInputIntegration({
          applyPaste: callback
        }),
      {
        initialProps: {
          applyPaste
        }
      }
    );
    const firstRef = result.current.pasteTrapRef;
    const firstOnPaste = result.current.onPaste;

    act(() => {
      result.current.onPaste({
        clipboardData: {
          getData: () => "Pilot A"
        }
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    });
    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "Pilot B"
      }
    });
    window.dispatchEvent(event);
    rerender({
      applyPaste
    });

    expect(result.current.pasteTrapRef).toBe(firstRef);
    expect(result.current.onPaste).toBe(firstOnPaste);
    expect(applyPaste).toHaveBeenCalledTimes(2);
    expect(applyPaste).toHaveBeenNthCalledWith(1, "Pilot A");
    expect(applyPaste).toHaveBeenNthCalledWith(2, "Pilot B");
  });

  it("deduplicates a single bubbled paste event from the trap textarea", () => {
    const applyPaste = vi.fn();

    function PasteHarness() {
      const { pasteTrapRef, onPaste } = usePasteInputIntegration({ applyPaste });
      return <textarea ref={pasteTrapRef} onPaste={onPaste} aria-label="paste-trap" />;
    }

    const harness = render(<PasteHarness />);
    const trap = harness.container.querySelector("textarea[aria-label='paste-trap']");
    expect(trap).toBeTruthy();
    const event = new Event("paste", { bubbles: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "Pilot C"
      }
    });

    act(() => {
      trap!.dispatchEvent(event);
    });

    expect(applyPaste).toHaveBeenCalledTimes(1);
    expect(applyPaste).toHaveBeenCalledWith("Pilot C");
  });

  it("handles one bubbled native paste event once even if both listeners observe it", () => {
    const applyPaste = vi.fn();
    const stopPropagationSpy = vi
      .spyOn(Event.prototype, "stopPropagation")
      .mockImplementation(() => undefined);

    function PasteHarness() {
      const { pasteTrapRef, onPaste } = usePasteInputIntegration({ applyPaste });
      return <textarea ref={pasteTrapRef} onPaste={onPaste} aria-label="paste-trap" />;
    }

    try {
      const harness = render(<PasteHarness />);
      const trap = harness.container.querySelector("textarea[aria-label='paste-trap']");
      expect(trap).toBeTruthy();
      const event = new Event("paste", { bubbles: true }) as ClipboardEvent;
      Object.defineProperty(event, "clipboardData", {
        value: {
          getData: () => "Pilot D"
        }
      });

      act(() => {
        trap!.dispatchEvent(event);
      });

      expect(applyPaste).toHaveBeenCalledTimes(1);
      expect(applyPaste).toHaveBeenCalledWith("Pilot D");
    } finally {
      stopPropagationSpy.mockRestore();
    }
  });
});
