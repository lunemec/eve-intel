/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FitCandidate } from "../lib/intel";
import type { FitMetricResult } from "../lib/useFitMetrics";
import type { PilotCard } from "../lib/usePilotIntelPipeline";
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

  it("renders only evidence-backed non-Fleet/Solo pills across pilot-card pill surfaces", () => {
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
                  url: "https://zkillboard.com/kill/91001/",
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
    expect(screen.getAllByText("Long Point")).toHaveLength(2);
  });
});
