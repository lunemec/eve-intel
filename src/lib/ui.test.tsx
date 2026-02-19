/**
 * @vitest-environment jsdom
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CynoRisk } from "./cyno";
import type { FitCandidate } from "./intel";
import type { ShipPrediction } from "./intel";
import { formatUpdaterStatus, inferTankTypeFromFit, renderResistCell, renderShipPills } from "./ui";

type FitModule = NonNullable<FitCandidate["modulesBySlot"]>["high"][number];

function ship(partial: Partial<ShipPrediction>): ShipPrediction {
  return {
    shipName: "Test Ship",
    probability: 55,
    source: "inferred",
    reason: [],
    rolePills: [],
    ...partial
  };
}

function fit(overrides: Partial<FitCandidate> = {}): FitCandidate {
  return {
    shipTypeId: 123,
    fitLabel: "test fit",
    confidence: 90,
    modulesBySlot: {
      high: [],
      mid: [],
      low: [],
      rig: [],
      cargo: [],
      other: []
    },
    alternates: [],
    ...overrides
  };
}

function moduleWithDogmaEffects(typeId: number, name: string, effects: string[]): FitModule {
  return {
    typeId,
    name,
    effects
  } as unknown as FitModule;
}

type TankCorpusExpectation = {
  fitId: string;
  expected: "shield" | "armor" | "hull" | null;
  classificationPath: "resolved-name" | "metadata-first" | "eft-fallback";
  fixture: {
    modulesBySlot?: FitCandidate["modulesBySlot"];
    eftSections?: FitCandidate["eftSections"];
  };
};

function loadTankInferenceCorpusExpectations(): TankCorpusExpectation[] {
  const filePath = path.join(process.cwd(), "data", "parity", "fit-corpus.jsonl");
  const raw = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const expectations: TankCorpusExpectation[] = [];
  for (const line of raw) {
    const row = JSON.parse(line) as {
      tankInferenceExpected?: TankCorpusExpectation["expected"];
      tankInferencePath?: TankCorpusExpectation["classificationPath"];
      tankInferenceFixture?: TankCorpusExpectation["fixture"];
      fitId?: string;
    };
    if (!("tankInferenceExpected" in row)) {
      continue;
    }
    expectations.push({
      fitId: String(row.fitId ?? ""),
      expected: row.tankInferenceExpected ?? null,
      classificationPath: row.tankInferencePath ?? "resolved-name",
      fixture: row.tankInferenceFixture ?? {}
    });
  }
  return expectations;
}

describe("ui helpers", () => {
  it("formats updater statuses", () => {
    expect(formatUpdaterStatus(null)).toBe("Updates: idle");
    expect(formatUpdaterStatus({ status: "dev", progress: 0, version: "1.0.0", availableVersion: null, downloadedVersion: null, error: null, errorDetails: null })).toBe("Updates: dev mode");
    expect(formatUpdaterStatus({ status: "downloading", progress: 37, version: "1.0.0", availableVersion: "1.0.1", downloadedVersion: null, error: null, errorDetails: null })).toBe("Updates: downloading 37%");
    expect(formatUpdaterStatus({ status: "downloaded", progress: 100, version: "1.0.0", availableVersion: "1.0.1", downloadedVersion: "1.0.1", error: null, errorDetails: null })).toBe("Updates: ready (1.0.1)");
    expect(formatUpdaterStatus({ status: "error", progress: 0, version: "1.0.0", availableVersion: null, downloadedVersion: null, error: "oops", errorDetails: null })).toBe("Updates: error (oops)");
  });

  it("renders resist cell with clamped percentage", () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>{renderResistCell(1.2, "damage-em")}</tr>
        </tbody>
      </table>
    );
    expect(container.querySelector(".ship-resist-cell.damage-em")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("infers shield tank from extenders and shield rigs", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [{ typeId: 1, name: "Large Shield Extender II" }],
          low: [],
          rig: [{ typeId: 2, name: "Medium Core Defense Field Extender I" }],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("shield");
  });

  it("infers armor tank from plates and armor repairers", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [],
          low: [
            { typeId: 1, name: "1600mm Steel Plates II" },
            { typeId: 2, name: "Large Armor Repairer II" }
          ],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("armor");
  });

  it("infers hull tank from hull reinforcers and hull repairers", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [],
          low: [
            { typeId: 1, name: "Reinforced Bulkheads II" },
            { typeId: 2, name: "Small Hull Repairer II" }
          ],
          rig: [{ typeId: 3, name: "Small Transverse Bulkhead I" }],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("hull");
  });

  it("returns null when tank signals are ambiguous", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [{ typeId: 1, name: "Large Shield Extender II" }],
          low: [{ typeId: 2, name: "1600mm Steel Plates II" }],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBeNull();
  });

  it("prefers resolved modules over conflicting EFT fallback sections", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [],
          low: [{ typeId: 1, name: "1600mm Steel Plates II" }],
          rig: [],
          cargo: [],
          other: []
        },
        eftSections: {
          high: [],
          mid: ["Large Shield Extender II"],
          low: [],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("armor");
  });

  it("falls back to EFT sections when resolved module names are unavailable", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [{ typeId: 1, name: "   " }],
          mid: [],
          low: [],
          rig: [],
          cargo: [],
          other: []
        },
        eftSections: {
          high: [],
          mid: ["Large Shield Extender II"],
          low: [],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("shield");
  });

  it("returns null for low-signal weak tank hints", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [{ typeId: 1, name: "Multispectrum Shield Hardener II" }],
          low: [],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBeNull();
  });

  it("returns null when top tank score is a near tie with runner-up", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [{ typeId: 1, name: "Large Shield Extender II" }],
          low: [{ typeId: 2, name: "Large Armor Repairer II" }],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBeNull();
  });

  it("keeps strong dominant tank scores classified", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [
            { typeId: 1, name: "Large Shield Extender II" },
            { typeId: 2, name: "Shield Boost Amplifier II" }
          ],
          low: [{ typeId: 3, name: "Large Armor Repairer II" }],
          rig: [{ typeId: 4, name: "Medium Core Defense Field Extender I" }],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("shield");
  });

  it("classifies shield tank from metadata when module names are ambiguous", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [moduleWithDogmaEffects(20001, "Auxiliary Power Core", ["shieldCapacityBonusOnline"])],
          low: [],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("shield");
  });

  it("classifies armor tank from metadata when module names are ambiguous", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [],
          low: [moduleWithDogmaEffects(20002, "Subsystem Coupler", ["armorHPBonusAdd"])],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("armor");
  });

  it("returns null for metadata-driven near ties under confidence and margin gates", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [moduleWithDogmaEffects(20003, "Utility Matrix", ["shieldCapacityBonusOnline"])],
          low: [moduleWithDogmaEffects(20004, "Damage Relay", ["armorDamageAmount"])],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBeNull();
  });

  it("weights metadata impact so shield capacity and boost beat more armor resistance hints", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [],
          mid: [
            moduleWithDogmaEffects(30001, "Core Matrix", ["shieldCapacityBonusOnline"]),
            moduleWithDogmaEffects(30002, "Flow Matrix", ["shieldBoostAmplifierBonus"])
          ],
          low: [
            moduleWithDogmaEffects(30003, "Resistance Node", ["armorResistanceBonus"]),
            moduleWithDogmaEffects(30004, "Resistance Node", ["armorHardenerBonus"]),
            moduleWithDogmaEffects(30005, "Resistance Node", ["armorResonanceBonus"]),
            moduleWithDogmaEffects(30006, "Resistance Node", ["armorReinforcerBonus"]),
            moduleWithDogmaEffects(30007, "Resistance Node", ["armorResistancePenalty"])
          ],
          rig: [],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("shield");
  });

  it("weights EFT fallback impact so hull core modules beat more shield hints", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [{ typeId: 1, name: "   " }],
          mid: [],
          low: [],
          rig: [],
          cargo: [],
          other: []
        },
        eftSections: {
          high: [],
          mid: ["Large Shield Extender II", "EM Shield Hardener II", "Thermal Shield Hardener II"],
          low: ["Reinforced Bulkheads II"],
          rig: ["Small Transverse Bulkhead I"],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBe("hull");
  });

  it("returns null for weighted near-tie fallback results under confidence and margin gates", () => {
    const result = inferTankTypeFromFit(
      fit({
        modulesBySlot: {
          high: [{ typeId: 1, name: "   " }],
          mid: [],
          low: [],
          rig: [],
          cargo: [],
          other: []
        },
        eftSections: {
          high: [],
          mid: ["Large Shield Extender II"],
          low: [
            "Multispectrum Armor Hardener II",
            "EM Armor Hardener II",
            "Explosive Armor Hardener II"
          ],
          rig: ["Small Armor Reinforcer I"],
          cargo: [],
          other: []
        }
      })
    );

    expect(result).toBeNull();
  });

  it("suppresses non-Fleet/Solo pills when selected evidence is missing", () => {
    const cynoRisk: CynoRisk = { potentialCyno: false, jumpAssociation: true, reasons: [] };
    render(
      <>
        {renderShipPills(
          ship({ shipName: "Onyx", cynoCapable: true, cynoChance: 100, rolePills: ["Web"] }),
          cynoRisk,
          "pill"
        )}
      </>
    );

    expect(screen.queryByText("Cyno")).toBeNull();
    expect(screen.queryByText("Bait")).toBeNull();
    expect(screen.queryByText("Web")).toBeNull();
  });

  it("suppresses non-evidence icon-link pills while keeping evidence-backed icons", () => {
    const webEvidenceUrl = "https://zkillboard.com/kill/42/";
    render(
      <>
        {renderShipPills(
          ship({
            rolePills: ["Web", "Long Point"],
            pillEvidence: {
              Web: {
                pillName: "Web",
                causingModule: "Stasis Webifier II",
                fitId: "700:Heavy tackle fit",
                killmailId: 42,
                url: webEvidenceUrl,
                timestamp: "2026-02-14T11:00:00.000Z"
              }
            }
          }),
          undefined,
          "icon-link"
        )}
      </>
    );

    const web = screen.getByLabelText("Web");
    expect(web.closest("a")?.getAttribute("href")).toBe(webEvidenceUrl);
    expect(screen.queryByLabelText("Long Point")).toBeNull();
  });

  it("renders only evidence-backed pills when selected evidence exists", () => {
    const cynoRisk: CynoRisk = { potentialCyno: false, jumpAssociation: true, reasons: [] };
    render(
      <>
        {renderShipPills(
          ship({
            shipName: "Onyx",
            cynoCapable: true,
            cynoChance: 100,
            rolePills: ["Web"],
            pillEvidence: {
              Cyno: {
                pillName: "Cyno",
                causingModule: "Cynosural Field Generator I",
                fitId: "700:Heavy tackle fit",
                killmailId: 41,
                url: "https://zkillboard.com/kill/41/",
                timestamp: "2026-02-13T11:00:00.000Z"
              },
              Bait: {
                pillName: "Bait",
                causingModule: "Damage Control II",
                fitId: "700:Heavy tackle fit",
                killmailId: 42,
                url: "https://zkillboard.com/kill/42/",
                timestamp: "2026-02-14T11:00:00.000Z"
              }
            }
          }),
          cynoRisk,
          "pill"
        )}
      </>
    );

    const bait = screen.getByText("Bait");
    const cyno = screen.getByText("Cyno");
    expect(bait).toBeTruthy();
    expect(cyno).toBeTruthy();
    expect(screen.queryByText("Web")).toBeNull();
  });

  it("links evidence-backed pill-mode pills to zKill evidence", () => {
    const cynoEvidenceUrl = "https://zkillboard.com/kill/41/";
    const webEvidenceUrl = "https://zkillboard.com/kill/42/";
    const { container } = render(
      <>
        {renderShipPills(
          ship({
            cynoCapable: true,
            cynoChance: 100,
            rolePills: ["Web"],
            pillEvidence: {
              Cyno: {
                pillName: "Cyno",
                causingModule: "Cynosural Field Generator I",
                fitId: "700:Heavy tackle fit",
                killmailId: 41,
                url: cynoEvidenceUrl,
                timestamp: "2026-02-13T11:00:00.000Z"
              },
              Web: {
                pillName: "Web",
                causingModule: "Stasis Webifier II",
                fitId: "700:Heavy tackle fit",
                killmailId: 42,
                url: webEvidenceUrl,
                timestamp: "2026-02-14T11:00:00.000Z"
              }
            }
          }),
          undefined,
          "pill"
        )}
      </>
    );

    const riskPills = Array.from(container.querySelectorAll(".risk-badge"));
    const cyno = riskPills.find((pill) => pill.textContent === "Cyno");
    const web = riskPills.find((pill) => pill.textContent === "Web");
    expect(cyno).toBeTruthy();
    expect(web).toBeTruthy();
    expect(cyno?.closest("a")?.getAttribute("href")).toBe(cynoEvidenceUrl);
    expect(web?.closest("a")?.getAttribute("href")).toBe(webEvidenceUrl);
  });

  it("renders icon-mode pills with image assets and links evidence-backed icons", () => {
    const cynoEvidenceUrl = "https://zkillboard.com/kill/41/";
    const webEvidenceUrl = "https://zkillboard.com/kill/42/";
    render(
      <>
        {renderShipPills(
          ship({
            cynoCapable: true,
            cynoChance: 100,
            rolePills: ["Web"],
            pillEvidence: {
              Cyno: {
                pillName: "Cyno",
                causingModule: "Cynosural Field Generator I",
                fitId: "700:Heavy tackle fit",
                killmailId: 41,
                url: cynoEvidenceUrl,
                timestamp: "2026-02-13T11:00:00.000Z"
              },
              Web: {
                pillName: "Web",
                causingModule: "Stasis Webifier II",
                fitId: "700:Heavy tackle fit",
                killmailId: 42,
                url: webEvidenceUrl,
                timestamp: "2026-02-14T11:00:00.000Z"
              }
            }
          }),
          undefined,
          "icon-link"
        )}
      </>
    );

    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    const cyno = screen.getByLabelText("Cyno");
    expect(cyno).toBeTruthy();
    expect(cyno.getAttribute("title")?.length).toBeGreaterThan(10);
    const web = screen.getAllByLabelText("Web")[0];
    expect(web).toBeTruthy();
    expect(cyno.closest("a")?.getAttribute("href")).toBe(cynoEvidenceUrl);
    expect(web.closest("a")?.getAttribute("href")).toBe(webEvidenceUrl);
  });

  it("validates Step 5 tank corpus coverage categories", () => {
    const expectations = loadTankInferenceCorpusExpectations();
    const byExpected = new Map<TankCorpusExpectation["expected"], number>([
      ["shield", 0],
      ["armor", 0],
      ["hull", 0],
      [null, 0]
    ]);
    for (const row of expectations) {
      byExpected.set(row.expected, (byExpected.get(row.expected) ?? 0) + 1);
    }

    expect(expectations.length).toBeGreaterThanOrEqual(6);
    expect(byExpected.get("shield")).toBeGreaterThanOrEqual(2);
    expect(byExpected.get("armor")).toBeGreaterThanOrEqual(2);
    expect(byExpected.get("hull")).toBeGreaterThanOrEqual(1);
    expect(byExpected.get(null)).toBeGreaterThanOrEqual(1);
    expect(expectations.some((row) => row.classificationPath === "metadata-first")).toBe(true);
    expect(expectations.some((row) => row.classificationPath === "eft-fallback")).toBe(true);
  });

  it("matches inferred tank type against Step 5 corpus expectations", () => {
    const expectations = loadTankInferenceCorpusExpectations();
    const fitIds = expectations.map((row) => row.fitId);

    expect(fitIds).toContain("tank-step5-shield-dominant");
    expect(fitIds).toContain("tank-step5-armor-dominant");
    expect(fitIds).toContain("tank-step5-hull-dominant");
    expect(fitIds).toContain("tank-step5-mixed-near-tie-null");
    expect(fitIds).toContain("tank-step5-metadata-first-shield");
    expect(fitIds).toContain("tank-step5-eft-fallback-armor");

    for (const row of expectations) {
      const result = inferTankTypeFromFit(
        fit({
          modulesBySlot: row.fixture.modulesBySlot,
          eftSections: row.fixture.eftSections
        })
      );
      expect(result, row.fitId).toBe(row.expected);
    }
  });
});
