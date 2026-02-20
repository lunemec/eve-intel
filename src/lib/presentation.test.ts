import { describe, expect, it } from "vitest";
import type { CynoRisk } from "./cyno";
import type { ShipPrediction } from "./intel";
import {
  formatEhp,
  formatIsk,
  formatRange,
  formatRatio,
  formatShipLikelihoodPercent,
  formatSpeedRange,
  getShipRiskFlags,
  orderRolePills,
  roleBadgeClass,
  roleIconClass,
  roleShort,
  shipHasPotentialCyno,
  threatClass,
  threatLabel,
  threatScore,
  toPct,
  toPctNumber
} from "./presentation";

function ship(partial: Partial<ShipPrediction>): ShipPrediction {
  return {
    shipName: "Test Ship",
    probability: 50,
    source: "inferred",
    reason: [],
    ...partial
  };
}

describe("presentation helpers", () => {
  it("formats ranges and EHP", () => {
    expect(formatRange(0)).toBe("—");
    expect(formatRange(9500)).toBe("9.5km");
    expect(formatRange(22000)).toBe("22km");
    expect(formatEhp(0)).toBe("—");
    expect(formatEhp(1450)).toBe("1.4k");
    expect(formatEhp(2_450_000)).toBe("2.45m");
  });

  it("formats speed and percentages", () => {
    expect(formatSpeedRange({ base: 100, propOn: 100, propOnHeated: 100 })).toBe("100m/s");
    expect(formatSpeedRange({ base: 100, propOn: 500, propOnHeated: 600 })).toBe("100m/s - 600m/s");
    expect(toPct(0.321)).toBe("32%");
    expect(toPctNumber(1.2)).toBe(100);
    expect(toPctNumber(-1)).toBe(0);
  });

  it("formats ship likelihood percentages as rounded whole numbers", () => {
    expect(formatShipLikelihoodPercent(82.6)).toBe("83%");
    expect(formatShipLikelihoodPercent(82.4)).toBe("82%");
    expect(formatShipLikelihoodPercent(101)).toBe("100%");
    expect(formatShipLikelihoodPercent(Number.NaN)).toBe("0%");
  });

  it("formats ratios and isk", () => {
    expect(formatRatio(undefined)).toBe("-");
    expect(formatRatio(2.345)).toBe("2.35");
    expect(formatIsk(undefined)).toBe("-");
    expect(formatIsk(1_250_000)).toBe("1.25m");
    expect(formatIsk(2_500_000_000)).toBe("2.50b");
  });

  it("maps threat labels/classes/scores", () => {
    expect(threatScore(undefined)).toBe("-");
    expect(threatScore(63)).toBe("6.3");
    expect(threatLabel(undefined)).toBe("N/A");
    expect(threatLabel(80)).toBe("HIGH");
    expect(threatLabel(55)).toBe("MED");
    expect(threatLabel(20)).toBe("LOW");
    expect(threatClass(undefined)).toBe("");
    expect(threatClass(80)).toBe("threat-high");
    expect(threatClass(55)).toBe("threat-medium");
    expect(threatClass(20)).toBe("threat-low");
  });

  it("maps role styling helpers", () => {
    expect(roleBadgeClass("HIC")).toBe("risk-role-hard");
    expect(roleBadgeClass("Web")).toBe("risk-role-control");
    expect(roleBadgeClass("Neut")).toBe("risk-role-pressure");
    expect(roleIconClass("Armor Logi")).toBe("alert-role-support");
    expect(roleShort("Long Point")).toBe("LP");
    expect(roleShort("Unknown Role")).toBe("UN");
    expect(orderRolePills(["Neut", "Web", "HIC"])).toEqual(["Web", "HIC", "Neut"]);
  });

  it("computes cyno and bait risk flags", () => {
    const cynoRisk: CynoRisk = { potentialCyno: false, jumpAssociation: true, reasons: [] };
    expect(
      getShipRiskFlags(
        ship({ shipName: "Onyx", cynoCapable: true, cynoChance: 60, probability: 70 }),
        cynoRisk
      )
    ).toEqual({ hardCyno: false, softCyno: false, bait: false });

    expect(
      getShipRiskFlags(
        ship({ shipName: "Onyx", cynoCapable: true, cynoChance: 100, probability: 70 }),
        cynoRisk
      )
    ).toEqual({ hardCyno: false, softCyno: false, bait: false });

    expect(
      getShipRiskFlags(
        ship({
          shipName: "Onyx",
          cynoCapable: true,
          cynoChance: 100,
          probability: 70,
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
        cynoRisk
      )
    ).toEqual({ hardCyno: true, softCyno: false, bait: true });

    expect(
      getShipRiskFlags(
        ship({ shipName: "Capsule", cynoCapable: true, cynoChance: 60, probability: 70 }),
        cynoRisk
      ).bait
    ).toBe(false);

    expect(shipHasPotentialCyno(ship({ cynoCapable: true, cynoChance: 99 }))).toBe(false);
    expect(shipHasPotentialCyno(ship({ cynoCapable: true, cynoChance: 100 }))).toBe(true);
  });
});
