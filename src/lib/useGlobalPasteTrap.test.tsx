/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGlobalPasteTrap } from "./useGlobalPasteTrap";

function Harness(props: { applyPaste: (text: string) => void }) {
  const ref = useGlobalPasteTrap({ applyPaste: props.applyPaste });
  return (
    <>
      <textarea ref={ref} data-testid="paste-trap" />
      <textarea data-testid="manual-input" />
    </>
  );
}

describe("useGlobalPasteTrap", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("focuses paste trap on mount and on window focus events", () => {
    const applyPaste = vi.fn();
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, "focus").mockImplementation(() => undefined);
    render(<Harness applyPaste={applyPaste} />);

    expect(focusSpy).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("focus"));
    expect(focusSpy).toHaveBeenCalledTimes(2);
  });

  it("passes window clipboard text into applyPaste and ignores empty payload", () => {
    const applyPaste = vi.fn();
    render(<Harness applyPaste={applyPaste} />);

    const withText = new Event("paste") as ClipboardEvent;
    Object.defineProperty(withText, "clipboardData", {
      value: { getData: () => "Pilot A" }
    });
    window.dispatchEvent(withText);

    const noText = new Event("paste") as ClipboardEvent;
    Object.defineProperty(noText, "clipboardData", {
      value: { getData: () => "" }
    });
    window.dispatchEvent(noText);

    expect(applyPaste).toHaveBeenCalledTimes(1);
    expect(applyPaste).toHaveBeenCalledWith("Pilot A");
  });

  it("removes global listeners on unmount", () => {
    const applyPaste = vi.fn();
    const { unmount } = render(<Harness applyPaste={applyPaste} />);

    unmount();
    const withText = new Event("paste") as ClipboardEvent;
    Object.defineProperty(withText, "clipboardData", {
      value: { getData: () => "Pilot B" }
    });
    window.dispatchEvent(withText);

    expect(applyPaste).not.toHaveBeenCalled();
  });

  it("does not steal focus from a user-editable field on window focus", () => {
    const applyPaste = vi.fn();
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");
    const view = render(<Harness applyPaste={applyPaste} />);
    const manualInput = view.getByTestId("manual-input") as HTMLTextAreaElement;

    manualInput.focus();
    window.dispatchEvent(new Event("focus"));

    expect(document.activeElement).toBe(manualInput);
    expect(focusSpy).toHaveBeenCalledTimes(2);
  });

  it("does not refocus paste trap when it is already active", () => {
    const applyPaste = vi.fn();
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");
    const view = render(<Harness applyPaste={applyPaste} />);
    const pasteTrap = view.getByTestId("paste-trap") as HTMLTextAreaElement;

    pasteTrap.focus();
    window.dispatchEvent(new Event("focus"));

    expect(document.activeElement).toBe(pasteTrap);
    expect(focusSpy).toHaveBeenCalledTimes(2);
  });
});
