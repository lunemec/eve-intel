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
});
