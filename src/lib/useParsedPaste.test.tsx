/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useParsedPaste } from "./useParsedPaste";

vi.mock("./parser", async () => {
  const actual = await vi.importActual<typeof import("./parser")>("./parser");
  return {
    ...actual,
    parseClipboardText: vi.fn()
  };
});

import { parseClipboardText } from "./parser";

describe("useParsedPaste", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("ignores empty payloads", () => {
    const logDebug = vi.fn();
    const { result } = renderHook(() => useParsedPaste({ logDebug }));

    act(() => {
      result.current.applyPaste("   ");
    });

    expect(parseClipboardText).not.toHaveBeenCalled();
    expect(result.current.lastPasteRaw).toBe("");
    expect(result.current.manualEntry).toBe("");
    expect(result.current.parseResult).toEqual({ entries: [], rejected: [] });
    expect(logDebug).not.toHaveBeenCalled();
  });

  it("parses trimmed input and updates state and debug log", () => {
    const logDebug = vi.fn();
    const toLocaleTimeStringSpy = vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("10:00:00 AM");
    const parsed = {
      entries: [
        {
          pilotName: "Pilot A",
          sourceLine: "Pilot A",
          parseConfidence: 1,
          shipSource: "inferred" as const
        }
      ],
      rejected: ["bad line"]
    };
    vi.mocked(parseClipboardText).mockReturnValue(parsed);
    const { result } = renderHook(() => useParsedPaste({ logDebug }));

    act(() => {
      result.current.applyPaste("  Pilot A  ");
    });

    expect(parseClipboardText).toHaveBeenCalledWith("Pilot A");
    expect(result.current.lastPasteRaw).toBe("Pilot A");
    expect(result.current.manualEntry).toBe("Pilot A");
    expect(result.current.lastPasteAt).toBe("10:00:00 AM");
    expect(result.current.parseResult).toEqual(parsed);
    expect(logDebug).toHaveBeenCalledWith("Paste parsed: entries=1, rejected=1", { rejected: ["bad line"] });
    expect(toLocaleTimeStringSpy).toHaveBeenCalled();
  });

  it("omits debug payload when there are no rejected rows", () => {
    const logDebug = vi.fn();
    vi.mocked(parseClipboardText).mockReturnValue({ entries: [], rejected: [] });
    const { result } = renderHook(() => useParsedPaste({ logDebug }));

    act(() => {
      result.current.applyPaste("Pilot B");
    });

    expect(logDebug).toHaveBeenCalledWith("Paste parsed: entries=0, rejected=0", undefined);
  });

  it("keeps applyPaste callback stable when logger reference does not change", () => {
    const logDebug = vi.fn();
    const { result, rerender } = renderHook(({ logger }) => useParsedPaste({ logDebug: logger }), {
      initialProps: { logger: logDebug }
    });
    const first = result.current.applyPaste;

    rerender({ logger: logDebug });
    expect(result.current.applyPaste).toBe(first);
  });

  it("does not update parseResult when semantic pilot list is unchanged", () => {
    const logDebug = vi.fn();
    vi.mocked(parseClipboardText)
      .mockReturnValueOnce({
        entries: [
          {
            pilotName: "Pilot A",
            sourceLine: "Pilot A",
            parseConfidence: 1,
            shipSource: "inferred"
          }
        ],
        rejected: []
      })
      .mockReturnValueOnce({
        entries: [
          {
            pilotName: " pilot a ",
            sourceLine: "pilot a",
            parseConfidence: 0.95,
            shipSource: "inferred"
          }
        ],
        rejected: ["ignored"]
      });
    const { result } = renderHook(() => useParsedPaste({ logDebug }));

    act(() => {
      result.current.applyPaste("Pilot A");
    });
    const firstParseResult = result.current.parseResult;

    act(() => {
      result.current.applyPaste(" pilot a ");
    });

    expect(parseClipboardText).toHaveBeenCalledTimes(2);
    expect(result.current.parseResult).toBe(firstParseResult);
    expect(result.current.lastPasteRaw).toBe("pilot a");
    expect(result.current.manualEntry).toBe("pilot a");
  });
});
