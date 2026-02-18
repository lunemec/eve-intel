import { afterEach, describe, expect, it, vi } from "vitest";
import type { FitCandidate } from "./intel";
import type { PilotCard } from "./usePilotIntelPipeline";
import { createFitMetricsResolver } from "./useFitMetrics";
import { calculateShipCombatMetrics } from "./dogma/calc";

vi.mock("./dogma/calc", () => ({
  calculateShipCombatMetrics: vi.fn()
}));

function makePilot(): PilotCard {
  return {
    parsedEntry: {
      pilotName: "Pilot A",
      sourceLine: "Pilot A",
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "ready",
    fetchPhase: "ready",
    characterId: 123,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

function makeFit(): FitCandidate {
  return {
    shipTypeId: 111,
    fitLabel: "Test Fit",
    confidence: 90,
    alternates: [],
    modulesBySlot: {
      high: [{ typeId: 10, name: "Gun A" }],
      mid: [{ typeId: 20, name: "Web A" }],
      low: [{ typeId: 30, name: "Plate A" }],
      rig: [],
      cargo: [],
      other: []
    }
  };
}

describe("createFitMetricsResolver", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns unavailable when fit is unresolved", () => {
    const getFitMetrics = createFitMetricsResolver({
      dogmaIndex: {} as never,
      logDebug: vi.fn()
    });

    expect(getFitMetrics(makePilot(), undefined)).toEqual({
      status: "unavailable",
      key: "none",
      reason: "No resolved fit modules available."
    });
  });

  it("returns unavailable when dogma pack is missing", () => {
    const getFitMetrics = createFitMetricsResolver({
      dogmaIndex: null,
      logDebug: vi.fn()
    });
    const fit = makeFit();

    const result = getFitMetrics(makePilot(), fit);
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") {
      throw new Error("expected unavailable fit metrics");
    }
    expect(result.reason).toBe("Dogma pack not loaded yet.");
  });

  it("computes and caches combat metrics", () => {
    vi.mocked(calculateShipCombatMetrics).mockReturnValue({
      dpsTotal: 100,
      alpha: 200,
      damageSplit: { em: 0.25, therm: 0.25, kin: 0.25, exp: 0.25 },
      engagementRange: { optimal: 1000, falloff: 2000, missileMax: 0, effectiveBand: 3000 },
      speed: { base: 100, propOn: 500, propOnHeated: 600 },
      signature: { base: 80, propOn: 120 },
      ehp: 30000,
      resists: {
        shield: { em: 0.2, therm: 0.3, kin: 0.4, exp: 0.5 },
        armor: { em: 0.2, therm: 0.3, kin: 0.4, exp: 0.5 },
        hull: { em: 0.2, therm: 0.3, kin: 0.4, exp: 0.5 }
      },
      confidence: 88,
      assumptions: []
    });
    const getFitMetrics = createFitMetricsResolver({
      dogmaIndex: {} as never,
      logDebug: vi.fn()
    });
    const pilot = makePilot();
    const fit = makeFit();

    const first = getFitMetrics(pilot, fit);
    const second = getFitMetrics(pilot, fit);

    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(vi.mocked(calculateShipCombatMetrics)).toHaveBeenCalledTimes(1);
  });

  it("returns cached unavailable result when calculator throws", () => {
    vi.mocked(calculateShipCombatMetrics).mockImplementation(() => {
      throw new Error("bad calc");
    });
    const getFitMetrics = createFitMetricsResolver({
      dogmaIndex: {} as never,
      logDebug: vi.fn()
    });
    const pilot = makePilot();
    const fit = makeFit();

    const first = getFitMetrics(pilot, fit);
    const second = getFitMetrics(pilot, fit);

    expect(first.status).toBe("unavailable");
    if (first.status !== "unavailable") {
      throw new Error("expected unavailable fit metrics");
    }
    expect(first.reason).toContain("Combat calculator failed: bad calc");
    expect(second).toEqual(first);
    expect(vi.mocked(calculateShipCombatMetrics)).toHaveBeenCalledTimes(1);
  });
});
