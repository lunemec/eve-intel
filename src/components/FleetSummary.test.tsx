/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as appUtils from "../lib/appUtils";
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
            predictedShips: [{ shipTypeId: 641, shipName: longShipName, probability: 81.6, source: "inferred", reason: [] }]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const shipColumn = document.querySelector(".fleet-col-ship");
    expect(shipColumn?.textContent).toContain("82%");
    expect(shipColumn?.textContent).not.toContain("81.6%");
    expect(shipColumn?.textContent).toContain(longShipName);
    const probability = shipColumn?.querySelector(".fleet-summary-probability");
    const shipName = shipColumn?.querySelector(".fleet-summary-ship");
    expect(probability).toBeTruthy();
    expect(shipName).toBeTruthy();
    expect(probability?.compareDocumentPosition(shipName!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders top two inferred ships in separate fleet summary columns", () => {
    render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Pilot",
            predictedShips: [
              { shipTypeId: 456, shipName: "Onyx", probability: 82, source: "inferred", reason: [] },
              { shipTypeId: 457, shipName: "Rapier", probability: 64, source: "inferred", reason: [] },
              { shipTypeId: 458, shipName: "Falcon", probability: 38, source: "inferred", reason: [] }
            ]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const primaryShipColumn = document.querySelector(".fleet-col-ship-primary");
    const secondaryShipColumn = document.querySelector(".fleet-col-ship-secondary");
    expect(primaryShipColumn?.textContent).toContain("Onyx");
    expect(primaryShipColumn?.textContent).toContain("82%");
    expect(secondaryShipColumn?.textContent).toContain("Rapier");
    expect(secondaryShipColumn?.textContent).toContain("64%");
    expect(screen.queryByText("Falcon")).toBeNull();
  });

  it("keeps secondary ship column empty when no second inferred ship exists", () => {
    render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Pilot",
            predictedShips: [{ shipTypeId: 456, shipName: "Onyx", probability: 82, source: "inferred", reason: [] }]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const secondaryShipColumn = document.querySelector(".fleet-col-ship-secondary");
    expect(secondaryShipColumn?.textContent?.trim()).toBe("");
    expect(screen.queryByText("—")).toBeNull();
  });

  it("adds explicit corporation and alliance column class hooks", () => {
    const { container } = render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Pilot",
            corporationId: 98000001,
            corporationName: "Corp Prime",
            allianceId: 99000001,
            allianceName: "Alliance Prime",
            predictedShips: [{ shipTypeId: 456, shipName: "Onyx", probability: 82, source: "inferred", reason: [] }]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const corporationColumn = container.querySelector(".fleet-col-corporation");
    const allianceColumn = container.querySelector(".fleet-col-alliance");
    expect(corporationColumn?.textContent).toContain("Corp Prime");
    expect(allianceColumn?.textContent).toContain("Alliance Prime");
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

  it("links evidence-backed allowed alert icons to zKill in fleet summary", () => {
    const evidenceUrl = "https://zkillboard.com/kill/9001/";
    render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Pilot",
            predictedShips: [
              {
                shipTypeId: 456,
                shipName: "Onyx",
                probability: 82,
                source: "inferred",
                reason: [],
                rolePills: ["HIC"],
                pillEvidence: {
                  HIC: {
                    pillName: "HIC",
                    causingModule: "Warp Disruption Field Generator II",
                    fitId: "9001:Heavy tackle",
                    killmailId: 9001,
                    url: evidenceUrl,
                    timestamp: "2026-02-18T21:00:00.000Z"
                  }
                }
              }
            ]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const hicIcon = screen.getByLabelText("HIC");
    const hicLink = hicIcon.closest("a");
    expect(hicLink).toBeTruthy();
    expect(hicLink?.getAttribute("href")).toBe(evidenceUrl);
  });

  it("shows pills from both top ships when both probabilities are within 45-55%", () => {
    render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Pilot",
            predictedShips: [
              {
                shipTypeId: 456,
                shipName: "Onyx",
                probability: 52,
                source: "inferred",
                reason: [],
                rolePills: ["HIC"],
                pillEvidence: {
                  HIC: {
                    pillName: "HIC",
                    causingModule: "Warp Disruption Field Generator II",
                    fitId: "9101:Onyx",
                    killmailId: 9101,
                    url: "https://zkillboard.com/kill/9101/",
                    timestamp: "2026-02-19T08:00:00.000Z"
                  }
                }
              },
              {
                shipTypeId: 457,
                shipName: "Sabre",
                probability: 48,
                source: "inferred",
                reason: [],
                rolePills: ["Bubble"],
                pillEvidence: {
                  Bubble: {
                    pillName: "Bubble",
                    causingModule: "Warp Disrupt Probe Launcher II",
                    fitId: "9102:Sabre",
                    killmailId: 9102,
                    url: "https://zkillboard.com/kill/9102/",
                    timestamp: "2026-02-19T09:00:00.000Z"
                  }
                }
              }
            ]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    expect(screen.getByLabelText("HIC")).toBeTruthy();
    expect(screen.getByLabelText("Bubble")).toBeTruthy();
  });

  it("keeps fleet summary pills on the top ship when top-two probabilities are outside 45-55%", () => {
    render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Pilot",
            predictedShips: [
              {
                shipTypeId: 456,
                shipName: "Onyx",
                probability: 60,
                source: "inferred",
                reason: [],
                rolePills: ["HIC"],
                pillEvidence: {
                  HIC: {
                    pillName: "HIC",
                    causingModule: "Warp Disruption Field Generator II",
                    fitId: "9201:Onyx",
                    killmailId: 9201,
                    url: "https://zkillboard.com/kill/9201/",
                    timestamp: "2026-02-19T10:00:00.000Z"
                  }
                }
              },
              {
                shipTypeId: 457,
                shipName: "Sabre",
                probability: 40,
                source: "inferred",
                reason: [],
                rolePills: ["Bubble"],
                pillEvidence: {
                  Bubble: {
                    pillName: "Bubble",
                    causingModule: "Warp Disrupt Probe Launcher II",
                    fitId: "9202:Sabre",
                    killmailId: 9202,
                    url: "https://zkillboard.com/kill/9202/",
                    timestamp: "2026-02-19T11:00:00.000Z"
                  }
                }
              }
            ]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    expect(screen.getByLabelText("HIC")).toBeTruthy();
    expect(screen.queryByLabelText("Bubble")).toBeNull();
  });

  it("shows only Fleet/Solo plus bait/cyno/interdiction pills in fleet summary alerts", () => {
    render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Pilot",
            stats: { soloRatio: 2 } as PilotCard["stats"],
            cynoRisk: { potentialCyno: false, jumpAssociation: true, reasons: [] },
            predictedShips: [
              {
                shipTypeId: 456,
                shipName: "Onyx",
                probability: 82,
                source: "inferred",
                reason: [],
                cynoCapable: true,
                cynoChance: 100,
                rolePills: ["Long Point", "Web", "HIC", "Bubble", "Neut"],
                pillEvidence: {
                  Bait: {
                    pillName: "Bait",
                    causingModule: "Warp Scrambler II",
                    fitId: "9002:Onyx",
                    killmailId: 9002,
                    url: "https://zkillboard.com/kill/9002/",
                    timestamp: "2026-02-19T01:00:00.000Z"
                  },
                  Cyno: {
                    pillName: "Cyno",
                    causingModule: "Cynosural Field Generator I",
                    fitId: "9003:Onyx",
                    killmailId: 9003,
                    url: "https://zkillboard.com/kill/9003/",
                    timestamp: "2026-02-19T02:00:00.000Z"
                  },
                  "Long Point": {
                    pillName: "Long Point",
                    causingModule: "Warp Disruptor II",
                    fitId: "9004:Onyx",
                    killmailId: 9004,
                    url: "https://zkillboard.com/kill/9004/",
                    timestamp: "2026-02-19T03:00:00.000Z"
                  },
                  Web: {
                    pillName: "Web",
                    causingModule: "Stasis Webifier II",
                    fitId: "9005:Onyx",
                    killmailId: 9005,
                    url: "https://zkillboard.com/kill/9005/",
                    timestamp: "2026-02-19T04:00:00.000Z"
                  },
                  HIC: {
                    pillName: "HIC",
                    causingModule: "Warp Disruption Field Generator II",
                    fitId: "9006:Onyx",
                    killmailId: 9006,
                    url: "https://zkillboard.com/kill/9006/",
                    timestamp: "2026-02-19T05:00:00.000Z"
                  },
                  Bubble: {
                    pillName: "Bubble",
                    causingModule: "Warp Disrupt Probe Launcher II",
                    fitId: "9007:Onyx",
                    killmailId: 9007,
                    url: "https://zkillboard.com/kill/9007/",
                    timestamp: "2026-02-19T06:00:00.000Z"
                  },
                  Neut: {
                    pillName: "Neut",
                    causingModule: "Heavy Energy Neutralizer II",
                    fitId: "9008:Onyx",
                    killmailId: 9008,
                    url: "https://zkillboard.com/kill/9008/",
                    timestamp: "2026-02-19T07:00:00.000Z"
                  }
                }
              }
            ]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    expect(screen.getByText("Fleet")).toBeTruthy();
    expect(screen.getByText("Bait")).toBeTruthy();
    expect(screen.getByLabelText("Cyno")).toBeTruthy();
    expect(screen.getByLabelText("HIC")).toBeTruthy();
    expect(screen.getByLabelText("Bubble")).toBeTruthy();

    expect(screen.queryByLabelText("Long Point")).toBeNull();
    expect(screen.queryByLabelText("Web")).toBeNull();
    expect(screen.queryByLabelText("Neut")).toBeNull();
  });

  it("does not trigger row anchor-scroll when Fleet/Solo pills are clicked", () => {
    const smoothScrollSpy = vi.spyOn(appUtils, "smoothScrollToElement").mockImplementation(() => {});
    const { container } = render(
      <FleetSummary
        pilotCards={[
          pilot({
            characterId: 123,
            characterName: "Fleet Pilot",
            stats: { soloRatio: 2 } as PilotCard["stats"],
            predictedShips: [{ shipTypeId: 456, shipName: "Onyx", probability: 82, source: "inferred", reason: [] }]
          })
        ]}
        copyableFleetCount={1}
        setNetworkNotice={vi.fn()}
        logDebug={vi.fn()}
      />
    );

    const detail = document.createElement("div");
    detail.id = "pilot-detail-char-123";
    document.body.append(detail);

    const row = container.querySelector(".fleet-summary-line");
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(smoothScrollSpy).toHaveBeenCalledTimes(1);
    smoothScrollSpy.mockClear();

    const fleetPill = container.querySelector(".fleet-col-alerts .risk-style-fleet");
    expect(fleetPill).toBeTruthy();
    fireEvent.click(fleetPill!);
    expect(smoothScrollSpy).not.toHaveBeenCalled();

    detail.remove();
    smoothScrollSpy.mockRestore();
  });
});
