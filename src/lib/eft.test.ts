import { describe, expect, it } from "vitest";
import { formatFitAsEft } from "./eft";

describe("formatFitAsEft", () => {
  it("returns unknown fit block when fit candidate is missing", () => {
    expect(formatFitAsEft("Falcon")).toBe("[Falcon, Unknown Fit]");
  });

  it("formats inferred fit as EFT-style multiline block", () => {
    const eft = formatFitAsEft("Viator", {
      shipTypeId: 1,
      fitLabel: "Covert Cynosural Field Generator I | 50MN Y-T8 Compact Microwarpdrive",
      confidence: 66.7,
      alternates: []
    });
    expect(eft).toContain("[Viator, Inferred 66.7%]");
    expect(eft).toContain("Covert Cynosural Field Generator I");
    expect(eft).toContain("50MN Y-T8 Compact Microwarpdrive");
  });

  it("renders grouped sections when slot data is available", () => {
    const eft = formatFitAsEft("Falcon", {
      shipTypeId: 2,
      fitLabel: "fallback label",
      confidence: 81.2,
      eftSections: {
        high: ["Covert Cynosural Field Generator I"],
        mid: ["ECM - Multispectral Jammer II"],
        low: [],
        rig: ["Medium Core Defense Field Extender I"],
        cargo: ["Navy Cap Booster 400"],
        other: []
      },
      alternates: []
    });

    expect(eft).toContain("High Slots:");
    expect(eft).toContain("Mid Slots:");
    expect(eft).toContain("Rig Slots:");
    expect(eft).not.toContain("Cargo:");
    expect(eft).toContain("Covert Cynosural Field Generator I");
  });
});
