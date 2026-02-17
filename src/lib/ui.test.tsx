/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CynoRisk } from "./cyno";
import type { ShipPrediction } from "./intel";
import { formatUpdaterStatus, renderResistCell, renderShipPills } from "./ui";

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

  it("renders ship pills in text mode", () => {
    const cynoRisk: CynoRisk = { potentialCyno: false, jumpAssociation: true, reasons: [] };
    render(<>{renderShipPills(ship({ shipName: "Onyx", cynoCapable: true, cynoChance: 65, rolePills: ["Web"] }), cynoRisk, "pill")}</>);

    expect(screen.getByText("Potential Cyno")).toBeTruthy();
    expect(screen.getByText("Bait")).toBeTruthy();
    expect(screen.getByText("Web")).toBeTruthy();
  });

  it("renders icon-mode pills with image assets", () => {
    render(<>{renderShipPills(ship({ cynoCapable: true, cynoChance: 70, rolePills: ["Web"] }), undefined, "icon")}</>);

    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Potential Cyno")).toBeTruthy();
    expect(screen.getByLabelText("Web")).toBeTruthy();
  });
});
