import { describe, expect, it } from "vitest";
import type { PilotCard } from "./usePilotIntelPipeline";
import { deriveAppViewModel } from "./appViewModel";

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

describe("deriveAppViewModel", () => {
  it("computes copyable fleet count from finite character IDs", () => {
    const result = deriveAppViewModel([
      pilot({ characterId: 100 }),
      pilot({ characterId: Number.NaN }),
      pilot({ characterId: 0 }),
      pilot({ characterId: undefined })
    ]);

    expect(result.copyableFleetCount).toBe(2);
  });

  it("hides global load when there are no pilot cards", () => {
    const result = deriveAppViewModel([]);
    expect(result.globalLoadProgress).toBe(1);
    expect(result.showGlobalLoad).toBe(false);
  });

  it("shows global load while aggregated progress is not complete", () => {
    const result = deriveAppViewModel([
      pilot({ status: "loading", fetchPhase: "loading" }),
      pilot({ status: "ready", fetchPhase: "ready" })
    ]);

    expect(result.globalLoadProgress).toBeLessThan(1);
    expect(result.showGlobalLoad).toBe(true);
  });

  it("hides global load when all pilots are complete", () => {
    const result = deriveAppViewModel([
      pilot({ status: "ready", fetchPhase: "ready", characterId: 100 }),
      pilot({ status: "error", fetchPhase: "error", characterId: 200 })
    ]);

    expect(result.globalLoadProgress).toBe(1);
    expect(result.showGlobalLoad).toBe(false);
  });
});
