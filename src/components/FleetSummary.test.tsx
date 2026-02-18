/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PilotCard } from "../lib/usePilotIntelPipeline";
import { FleetSummary } from "./FleetSummary";

function pilot(overrides: Partial<PilotCard> = {}): PilotCard {
  return {
    parsedEntry: {
      pilotName: "Pilot A",
      sourceLine: "Pilot A",
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "ready",
    fetchPhase: "ready",
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: [],
    ...overrides
  };
}

describe("FleetSummary", () => {
  afterEach(() => {
    cleanup();
  });

  it("copies resolved pilot names to clipboard and reports success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true
    });
    const setNetworkNotice = vi.fn();
    const logDebug = vi.fn();

    render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Resolved Pilot",
            predictedShips: [{ shipTypeId: 456, shipName: "Onyx", probability: 82, source: "inferred", reason: [] }]
          }),
          pilot({
            parsedEntry: {
              pilotName: "Unresolved Pilot",
              sourceLine: "Unresolved Pilot",
              parseConfidence: 1,
              shipSource: "inferred"
            }
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={setNetworkNotice}
        logDebug={logDebug}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy to Clipboard" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("Resolved Pilot");
    });
    expect(setNetworkNotice).toHaveBeenCalledWith("Copied 1 pilot link(s) to clipboard.");
    expect(logDebug).toHaveBeenCalledWith("Fleet summary copied to clipboard", { count: 1 });
  });

  it("disables copy button when no pilot has resolved character id", () => {
    render(
      <FleetSummary
        pilotCards={[pilot({ characterId: undefined })]}
        copyableFleetCount={0}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const copyButton = screen.getByRole("button", { name: "Copy to Clipboard" }) as HTMLButtonElement;
    expect(copyButton.disabled).toBe(true);
    expect(screen.getByText("No inferred ship")).toBeTruthy();
  });

  it("renders ship probability token before ship name and keeps both visible", () => {
    const longShipName = "Federation Navy Megathron Ultra Long Hull Name Variant";
    render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Pilot",
            predictedShips: [{ shipTypeId: 641, shipName: longShipName, probability: 82, source: "inferred", reason: [] }]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const shipColumn = document.querySelector(".fleet-col-ship");
    expect(shipColumn?.textContent).toContain("82%");
    expect(shipColumn?.textContent).toContain(longShipName);
    const probability = shipColumn?.querySelector(".fleet-summary-probability");
    const shipName = shipColumn?.querySelector(".fleet-summary-ship");
    expect(probability).toBeTruthy();
    expect(shipName).toBeTruthy();
    expect(probability?.compareDocumentPosition(shipName!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders fleet threat score/class from pilot danger metric", () => {
    const { container } = render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Pilot",
            stats: { danger: 80 } as PilotCard["stats"]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const score = container.querySelector(".fleet-efficiency");
    expect(score?.textContent).toBe("8.0");
    expect(score?.className).toContain("threat-high");
  });

  it("renders Fleet/Solo engagement pills in summary alerts based on solo ratio", () => {
    const { container } = render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Fleet Pilot",
            stats: { soloRatio: 2 } as PilotCard["stats"],
            predictedShips: [{ shipTypeId: 456, shipName: "Onyx", probability: 82, source: "inferred", reason: [] }]
          }),
          pilot({
            parsedEntry: {
              pilotName: "Solo Pilot",
              sourceLine: "Solo Pilot",
              parseConfidence: 1,
              shipSource: "inferred"
            },
            characterId: 124,
            characterName: "Solo Pilot",
            stats: { soloRatio: 20 } as PilotCard["stats"],
            predictedShips: [{ shipTypeId: 457, shipName: "Rapier", probability: 70, source: "inferred", reason: [] }]
          })
        ]}
        copyableFleetCount={2}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const fleetPill = container.querySelector(".fleet-col-alerts .risk-style-fleet");
    const soloPill = container.querySelector(".fleet-col-alerts .risk-style-solo");
    expect(fleetPill?.textContent).toBe("Fleet");
    expect(soloPill?.textContent).toBe("Solo");
    expect(fleetPill?.getAttribute("title")?.length).toBeGreaterThan(10);
    expect(soloPill?.getAttribute("title")?.length).toBeGreaterThan(10);
  });
});
