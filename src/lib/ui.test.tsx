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

  it("suppresses cyno and bait pills when heuristic signals exist but evidence is missing", () => {
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
    const web = screen.getByText("Web");
    expect(web).toBeTruthy();
    expect(web.getAttribute("title")?.length).toBeGreaterThan(10);
  });

  it("renders cyno and bait pills when selected evidence exists", () => {
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
    expect(screen.getAllByText("Web").length).toBeGreaterThan(0);
  });

  it("renders icon-mode pills with image assets", () => {
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
                url: "https://zkillboard.com/kill/41/",
                timestamp: "2026-02-13T11:00:00.000Z"
              }
            }
          }),
          undefined,
          "icon"
        )}
      </>
    );

    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    const cyno = screen.getByLabelText("Cyno");
    expect(cyno).toBeTruthy();
    expect(cyno.getAttribute("title")?.length).toBeGreaterThan(10);
    expect(screen.getByLabelText("Web")).toBeTruthy();
  });
});
