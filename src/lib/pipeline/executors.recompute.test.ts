import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZkillKillmail } from "../api/zkill";
import type { PilotCard } from "../usePilotIntelPipeline";

const mocked = vi.hoisted(() => ({
  setCachedAsync: vi.fn(async () => undefined),
  deriveShipPredictions: vi.fn(() => []),
  deriveFitCandidates: vi.fn(() => []),
  evaluateCynoRisk: vi.fn(() => ({
    potentialCyno: false,
    jumpAssociation: false,
    reasons: [] as string[]
  })),
  estimateShipCynoChance: vi.fn(() => new Map()),
  deriveShipRolePills: vi.fn(() => new Map())
}));

vi.mock("../cache", async () => {
  const actual = await vi.importActual<typeof import("../cache")>("../cache");
  return {
    ...actual,
    setCachedAsync: mocked.setCachedAsync
  };
});

vi.mock("../intel", async () => {
  const actual = await vi.importActual<typeof import("../intel")>("../intel");
  return {
    ...actual,
    deriveShipPredictions: mocked.deriveShipPredictions,
    deriveFitCandidates: mocked.deriveFitCandidates
  };
});

vi.mock("../cyno", () => ({
  evaluateCynoRisk: mocked.evaluateCynoRisk,
  estimateShipCynoChance: mocked.estimateShipCynoChance
}));

vi.mock("../roles", () => ({
  deriveShipRolePills: mocked.deriveShipRolePills
}));

vi.mock("./constants", async () => {
  const actual = await vi.importActual<typeof import("./constants")>("./constants");
  return {
    ...actual,
    DEV_FIT_DUMP_ENABLED: () => false
  };
});

import { recomputeDerivedInference } from "./executors";

function makePilotCard(kills: ZkillKillmail[], losses: ZkillKillmail[]): PilotCard {
  return {
    parsedEntry: {
      pilotName: "Pilot Perf",
      sourceLine: "Pilot Perf",
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "ready",
    characterId: 42,
    predictedShips: [],
    fitCandidates: [],
    kills,
    losses,
    inferenceKills: kills,
    inferenceLosses: losses
  };
}

describe("pipeline/executors recompute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.deriveShipPredictions.mockReturnValue([]);
    mocked.deriveFitCandidates.mockReturnValue([]);
    mocked.evaluateCynoRisk.mockReturnValue({
      potentialCyno: false,
      jumpAssociation: false,
      reasons: []
    });
    mocked.estimateShipCynoChance.mockReturnValue(new Map());
    mocked.deriveShipRolePills.mockReturnValue(new Map());
  });

  it("avoids duplicate attacker scans while summarizing coverage and top ships", async () => {
    let attackerReads = 0;
    const kills: ZkillKillmail[] = [
      {
        killmail_id: 1,
        killmail_time: "2026-02-10T00:00:00Z",
        victim: {},
        get attackers() {
          attackerReads += 1;
          return [{ character_id: 42, ship_type_id: 111 }];
        },
        zkb: {}
      }
    ];
    const losses: ZkillKillmail[] = [
      {
        killmail_id: 2,
        killmail_time: "2026-02-09T00:00:00Z",
        victim: { character_id: 42, ship_type_id: 111 },
        attackers: [],
        zkb: {}
      }
    ];

    await recomputeDerivedInference({
      row: makePilotCard(kills, losses),
      settings: { lookbackDays: 7 },
      namesById: new Map([[111, "Ship A"]]),
      cacheKey: "derived.perf.test",
      debugLog: vi.fn()
    });

    expect(attackerReads).toBe(1);
    expect(mocked.setCachedAsync).toHaveBeenCalledTimes(1);
  });
});
