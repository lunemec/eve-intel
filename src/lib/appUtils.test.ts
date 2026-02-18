/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PilotCard } from "./usePilotIntelPipeline";
import {
  aggregatePilotProgress,
  extractErrorMessage,
  pilotDetailAnchorId,
  pilotProgressWeight,
  safeStringify,
  smoothScrollToElement
} from "./appUtils";

function pilot(overrides: Partial<PilotCard> = {}): PilotCard {
  return {
    parsedEntry: {
      pilotName: "Pilot A",
      sourceLine: "Pilot A",
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "loading",
    fetchPhase: "loading",
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: [],
    ...overrides
  };
}

describe("app utils", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("extracts human-readable error messages", () => {
    expect(extractErrorMessage(new Error("boom"))).toBe("boom");
    expect(extractErrorMessage("plain")).toBe("plain");
  });

  it("stringifies values with fallback for circular structures", () => {
    expect(safeStringify({ ok: true })).toBe('{"ok":true}');
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(safeStringify(circular)).toContain("[object Object]");
  });

  it("computes pilot progress weights and aggregate progress", () => {
    expect(pilotProgressWeight(pilot({ status: "error", fetchPhase: "error" }))).toBe(1);
    expect(pilotProgressWeight(pilot({ status: "ready", fetchPhase: "ready" }))).toBe(1);
    expect(pilotProgressWeight(pilot({ status: "ready", fetchPhase: "enriching" }))).toBe(0.72);
    expect(pilotProgressWeight(pilot({ status: "ready", fetchPhase: "loading" }))).toBe(0.55);
    expect(pilotProgressWeight(pilot({ status: "loading", fetchPhase: "loading" }))).toBe(0.2);

    expect(aggregatePilotProgress([])).toBe(1);
    expect(
      aggregatePilotProgress([
        pilot({ status: "loading", fetchPhase: "loading" }),
        pilot({ status: "ready", fetchPhase: "ready" })
      ])
    ).toBeCloseTo(0.6, 5);
  });

  it("builds stable pilot detail anchor IDs", () => {
    expect(pilotDetailAnchorId(pilot({ characterId: 123 }))).toBe("pilot-detail-char-123");
    expect(pilotDetailAnchorId(pilot({ characterId: undefined, parsedEntry: { pilotName: "A B+C", sourceLine: "x", parseConfidence: 1, shipSource: "inferred" } }))).toBe("pilot-detail-a-b-c");
  });

  it("skips smooth scroll when delta is negligible", () => {
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 0, height: 0, top: 1, right: 0, bottom: 0, left: 0, toJSON: () => ({})
    } as DOMRect);
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    smoothScrollToElement(element, 120);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("animates smooth scroll toward target", () => {
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 0, height: 0, top: 200, right: 0, bottom: 0, left: 0, toJSON: () => ({})
    } as DOMRect);
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 100
    });
    vi.spyOn(performance, "now").mockReturnValue(0);
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(1000);
      return 1;
    });

    smoothScrollToElement(element, 120);
    expect(scrollToSpy).toHaveBeenCalled();
  });
});
