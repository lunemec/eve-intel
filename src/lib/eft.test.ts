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

  it("renders T3 cruiser other modules as Subsystems section", () => {
    const eft = formatFitAsEft("Tengu", {
      shipTypeId: 29984,
      fitLabel: "fallback label",
      confidence: 100,
      eftSections: {
        high: ["Heavy Assault Missile Launcher II,Scourge Rage Heavy Assault Missile"],
        mid: ["Missile Guidance Computer II,Missile Range Script"],
        low: ["Ballistic Control System II"],
        rig: ["Medium Hydraulic Bay Thrusters I"],
        cargo: [],
        other: [
          "Tengu Core - Augmented Graviton Reactor",
          "Tengu Defensive - Covert Reconfiguration",
          "Tengu Offensive - Accelerated Ejection Bay",
          "Tengu Propulsion - Interdiction Nullifier"
        ]
      },
      alternates: []
    });

    expect(eft).toContain("Subsystems:");
    expect(eft).not.toContain("Other:");
    expect(eft).toContain("Tengu Offensive - Accelerated Ejection Bay");
  });

  it("keeps Other section title for non-T3 cruiser fits", () => {
    const eft = formatFitAsEft("Tristan", {
      shipTypeId: 593,
      fitLabel: "fallback label",
      confidence: 90,
      eftSections: {
        high: ["Modal Light Neutron Particle Accelerator I,Caldari Navy Antimatter Charge S"],
        mid: [],
        low: [],
        rig: [],
        cargo: [],
        other: ["Warrior II x3"]
      },
      alternates: []
    });

    expect(eft).toContain("Other:");
    expect(eft).not.toContain("Subsystems:");
  });
});
