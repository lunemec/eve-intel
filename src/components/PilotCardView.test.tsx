/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FitCandidate } from "../lib/intel";
import type { FitMetricResult } from "../lib/useFitMetrics";
import type { PilotCard } from "../lib/pilotDomain";
import { PilotCardView } from "./PilotCardView";

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

function fit(overrides: Partial<FitCandidate> = {}): FitCandidate {
  return {
    shipTypeId: 456,
    fitLabel: "test fit",
    confidence: 90,
    modulesBySlot: { high: [], mid: [], low: [], rig: [], other: [], cargo: [] },
    alternates: [],
    ...overrides
  };
}

function readyMetrics(): Extract<FitMetricResult, { status: "ready" }> {
  return {
    status: "ready",
    key: "ready",
    value: {
      dpsTotal: 420,
      alpha: 900,
      damageSplit: { em: 0.25, therm: 0.25, kin: 0.25, exp: 0.25 },
      engagementRange: { optimal: 12000, falloff: 8000, missileMax: 0, effectiveBand: 20000 },
      speed: { base: 250, propOn: 1200, propOnHeated: 1450 },
      signature: { base: 80, propOn: 160 },
      ehp: 65000,
      resists: {
        shield: { em: 0.2, therm: 0.3, kin: 0.4, exp: 0.5 },
        armor: { em: 0.6, therm: 0.7, kin: 0.65, exp: 0.72 },
        hull: { em: 0.33, therm: 0.33, kin: 0.33, exp: 0.33 }
      },
      confidence: 90,
      assumptions: []
    }
  };
}

describe("PilotCardView", () => {
  it("shows waiting state when no inferred ships are available", () => {
    render(
      <PilotCardView
        pilot={pilot({ status: "loading", predictedShips: [] })}
        getFitMetrics={vi.fn()}
      />
    );

    expect(screen.getByText("Waiting for zKill inference")).toBeTruthy();
  });

  it("shows EFT copy for non-capsule fits and hides it for capsule-like hull names", () => {
    const metrics: FitMetricResult = { status: "unavailable", key: "k", reason: "No dogma" };
    const getFitMetrics = vi.fn(() => metrics);
    const p = pilot({
      status: "ready",
      predictedShips: [
        { shipTypeId: 456, shipName: "Onyx", probability: 75, source: "inferred", reason: [] },
        { shipTypeId: 789, shipName: "Capsule", probability: 25, source: "inferred", reason: [] }
      ],
      fitCandidates: [fit({ shipTypeId: 456 }), fit({ shipTypeId: 789 })]
    });

    render(<PilotCardView pilot={p} getFitMetrics={getFitMetrics} />);

    expect(screen.getAllByRole("button", { name: "Copy EFT" }).length).toBe(1);
    expect(screen.getAllByText("Onyx").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Capsule").length).toBeGreaterThan(0);
  });

  it("rounds decimal ship likelihood percentages to whole numbers in ship summary and likely ships", () => {
    const metrics: FitMetricResult = { status: "unavailable", key: "k", reason: "No dogma" };
    const p = pilot({
      status: "ready",
      predictedShips: [
        { shipTypeId: 456, shipName: "Onyx", probability: 82.6, source: "inferred", reason: [] }
      ]
    });

    render(<PilotCardView pilot={p} getFitMetrics={vi.fn(() => metrics)} />);

    expect(screen.getAllByText("83%")).toHaveLength(2);
    expect(screen.queryByText("82.6%")).toBeNull();
  });

  it("highlights detected tank row while keeping S/A/H labels in resist table", () => {
    const p = pilot({
      status: "ready",
      predictedShips: [
        { shipTypeId: 456, shipName: "Onyx", probability: 75, source: "inferred", reason: [] }
      ],
      fitCandidates: [
        fit({
          shipTypeId: 456,
          modulesBySlot: {
            high: [],
            mid: [],
            low: [{ typeId: 1, name: "1600mm Steel Plates II" }],
            rig: [],
            cargo: [],
            other: []
          }
        })
      ]
    });

    const { container } = render(<PilotCardView pilot={p} getFitMetrics={vi.fn(() => readyMetrics())} />);

    const armorRow = container.querySelector(".ship-resist-table tbody tr:nth-child(2)");
    const armorRowHeader = armorRow?.querySelector("th");
    expect(armorRow).toBeTruthy();
    expect(armorRow?.classList.contains("ship-resist-row-warning")).toBe(true);
    expect(armorRowHeader?.textContent).toBe("A");
    expect(armorRowHeader?.getAttribute("title")).toContain("Armor tank detected");
  });

  it("renders resist damage header icons in EM/Thermal/Kinetic/Explosive order", () => {
    const p = pilot({
      status: "ready",
      predictedShips: [
        { shipTypeId: 456, shipName: "Onyx", probability: 75, source: "inferred", reason: [] }
      ],
      fitCandidates: [fit({ shipTypeId: 456 })]
    });
    const { container } = render(<PilotCardView pilot={p} getFitMetrics={vi.fn(() => readyMetrics())} />);

    const headerIcons = Array.from(container.querySelectorAll(".ship-resist-damage-head img"));
    expect(headerIcons.map((icon) => icon.getAttribute("alt"))).toEqual([
      "EM resistance profile",
      "Thermal resistance profile",
      "Kinetic resistance profile",
      "Explosive resistance profile"
    ]);
    expect(headerIcons[0]?.getAttribute("src")).toContain("icons/damage/em_big.png");
  });

  it("renders leading DPS and speed icons from computed combat metrics", () => {
    const p = pilot({
      status: "ready",
      predictedShips: [
        { shipTypeId: 456, shipName: "Onyx", probability: 75, source: "inferred", reason: [] }
      ],
      fitCandidates: [fit({ shipTypeId: 456 })]
    });
    const metrics = readyMetrics();
    metrics.value.primaryDpsTypeId = 2410;
    metrics.value.primaryDpsSourceLabel = "Missile Launchers";
    metrics.value.propulsionKind = "mwd";

    render(<PilotCardView pilot={p} getFitMetrics={vi.fn(() => metrics)} />);

    const dpsIcon = screen.getByRole("img", { name: "Missile Launchers" });
    const speedIcon = screen.getByRole("img", { name: "Fitted propulsion: mwd" });
    expect(dpsIcon.getAttribute("src")).toContain("/types/2410/icon?size=64");
    expect(speedIcon.getAttribute("src")).toContain("/types/35660/icon?size=64");
  });

  it("shows gang profile line with Fleet pill when solo ratio is low", () => {
    const metrics: FitMetricResult = { status: "unavailable", key: "k", reason: "No dogma" };
    render(
      <PilotCardView
        pilot={pilot({
          status: "ready",
          stats: {
            kills: 100,
            losses: 20,
            kdRatio: 5,
            solo: 3,
            soloRatio: 3,
            iskDestroyed: 1_000_000,
            iskLost: 500_000,
            iskRatio: 2,
            danger: 60,
            avgGangSize: 3.6,
            gangRatio: 98
          }
        })}
        getFitMetrics={vi.fn(() => metrics)}
      />
    );

    expect(screen.getByText("3.6 (98%)")).toBeTruthy();
    expect(screen.getAllByText("Fleet")).toHaveLength(1);
  });

  it("shows Solo pill when solo ratio is high", () => {
    const metrics: FitMetricResult = { status: "unavailable", key: "k", reason: "No dogma" };
    const { container } = render(
      <PilotCardView
        pilot={pilot({
          status: "ready",
          stats: {
            kills: 50,
            losses: 10,
            kdRatio: 5,
            solo: 10,
            soloRatio: 20,
            iskDestroyed: 1_000_000,
            iskLost: 500_000,
            iskRatio: 2,
            danger: 60,
            avgGangSize: 1.2,
            gangRatio: 80
          }
        })}
        getFitMetrics={vi.fn(() => metrics)}
      />
    );

    expect(container.querySelector(".risk-style-solo")?.textContent).toBe("Solo");
    expect(screen.getAllByText("Solo")).toHaveLength(1);
  });

  it("shows Fleet/Solo engagement pill next to alliance link area and exposes hover reason", () => {
    const metrics: FitMetricResult = { status: "unavailable", key: "k", reason: "No dogma" };
    const { container } = render(
      <PilotCardView
        pilot={pilot({
          status: "ready",
          allianceId: 99000001,
          allianceName: "Alliance A",
          stats: {
            kills: 100,
            losses: 20,
            kdRatio: 5,
            solo: 2,
            soloRatio: 2,
            iskDestroyed: 1_000_000,
            iskLost: 500_000,
            iskRatio: 2,
            danger: 60,
            avgGangSize: 4.2,
            gangRatio: 98
          }
        })}
        getFitMetrics={vi.fn(() => metrics)}
      />
    );

    const threatPillRow = container.querySelector(".player-threat-pill");
    expect(threatPillRow?.textContent).toContain("Fleet");
    const fleetPill = container.querySelector(".player-threat-pill .risk-style-fleet");
    expect(fleetPill?.getAttribute("title")?.length).toBeGreaterThan(10);
  });

  it("does not render Cyno Capable pill in likely ships", () => {
    const metrics: FitMetricResult = { status: "unavailable", key: "k", reason: "No dogma" };
    render(
      <PilotCardView
        pilot={pilot({
          status: "ready",
          predictedShips: [
            {
              shipTypeId: 12013,
              shipName: "Onyx",
              probability: 70,
              source: "inferred",
              reason: [],
              cynoCapable: true
            }
          ]
        })}
        getFitMetrics={vi.fn(() => metrics)}
      />
    );

    expect(screen.queryByText("Cyno Capable")).toBeNull();
  });

  it("renders only evidence-backed non-Fleet/Solo pills across pilot-card pill surfaces", () => {
    const metrics: FitMetricResult = { status: "unavailable", key: "k", reason: "No dogma" };
    const longPointEvidenceUrl = "https://zkillboard.com/kill/91001/";
    render(
      <PilotCardView
        pilot={pilot({
          status: "ready",
          predictedShips: [
            {
              shipTypeId: 12013,
              shipName: "Onyx",
              probability: 70,
              source: "inferred",
              reason: [],
              rolePills: ["Web"]
            },
            {
              shipTypeId: 11963,
              shipName: "Rapier",
              probability: 30,
              source: "inferred",
              reason: [],
              rolePills: ["Long Point"],
              pillEvidence: {
                "Long Point": {
                  pillName: "Long Point",
                  causingModule: "Warp Disruptor II",
                  fitId: "11963:Rapier fit",
                  killmailId: 91001,
                  url: longPointEvidenceUrl,
                  timestamp: "2026-02-14T11:00:00.000Z"
                }
              }
            }
          ]
        })}
        getFitMetrics={vi.fn(() => metrics)}
      />
    );

    expect(screen.queryAllByText("Web")).toHaveLength(0);
    const longPointPills = screen.getAllByText("Long Point");
    expect(longPointPills).toHaveLength(2);
    for (const pill of longPointPills) {
      expect(pill.closest("a")?.getAttribute("href")).toBe(longPointEvidenceUrl);
    }
  });

  it("delegates overview and likely-ships surfaces to extracted PilotCard subviews", async () => {
    vi.resetModules();
    const overviewSpy = vi.fn((props: { pilot: PilotCard }) => (
      <section data-testid="pilot-card-overview-subview">{props.pilot.parsedEntry.pilotName}</section>
    ));
    const likelyShipsSpy = vi.fn((props: { pilot: PilotCard }) => (
      <aside data-testid="pilot-card-likely-ships-subview">{props.pilot.parsedEntry.pilotName}</aside>
    ));

    vi.doMock("./pilotCardSubviews", () => ({
      PilotCardOverviewSubview: overviewSpy,
      PilotCardLikelyShipsSubview: likelyShipsSpy
    }));

    try {
      const { PilotCardView: IsolatedPilotCardView } = await import("./PilotCardView");
      const samplePilot = pilot({
        status: "ready",
        predictedShips: [{ shipTypeId: 456, shipName: "Onyx", probability: 80, source: "inferred", reason: [] }]
      });
      const unavailableMetrics: FitMetricResult = { status: "unavailable", key: "k", reason: "No dogma" };
      render(
        <IsolatedPilotCardView
          pilot={samplePilot}
          getFitMetrics={vi.fn((): FitMetricResult => unavailableMetrics)}
        />
      );

      expect(screen.getByTestId("pilot-card-overview-subview")).toBeTruthy();
      expect(screen.getByTestId("pilot-card-likely-ships-subview")).toBeTruthy();
      expect(overviewSpy).toHaveBeenCalled();
      expect(likelyShipsSpy).toHaveBeenCalled();
      expect(overviewSpy.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ pilot: samplePilot }));
      expect(likelyShipsSpy.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ pilot: samplePilot }));
    } finally {
      vi.doUnmock("./pilotCardSubviews");
      vi.resetModules();
    }
  });
});
