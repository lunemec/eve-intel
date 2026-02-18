import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZkillKillmail } from "../api/zkill";
import type { PilotCard } from "../usePilotIntelPipeline";

const mocked = vi.hoisted(() => ({
  setCachedAsync: vi.fn(async () => undefined),
  deriveShipPredictions: vi.fn((..._args: unknown[]) => [] as unknown[]),
  deriveFitCandidates: vi.fn((..._args: unknown[]) => [] as unknown[]),
  evaluateCynoRisk: vi.fn((..._args: unknown[]) => ({
    potentialCyno: false,
    jumpAssociation: false,
    reasons: [] as string[]
  })),
  estimateShipCynoChance: vi.fn((..._args: unknown[]) => new Map()),
  deriveShipCynoBaitEvidence: vi.fn((..._args: unknown[]) => new Map()),
  deriveShipRolePills: vi.fn((..._args: unknown[]) => new Map())
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
  estimateShipCynoChance: mocked.estimateShipCynoChance,
  deriveShipCynoBaitEvidence: mocked.deriveShipCynoBaitEvidence
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
    mocked.deriveShipCynoBaitEvidence.mockReturnValue(new Map());
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

  it("merges selected pillEvidence into predicted ships and emits per-pill debug payloads", async () => {
    mocked.deriveShipPredictions.mockReturnValue([
      {
        shipTypeId: 111,
        shipName: "Onyx",
        probability: 87,
        source: "inferred",
        reason: ["recent losses"]
      }
    ]);
    mocked.deriveFitCandidates.mockReturnValue([
      {
        shipTypeId: 111,
        fitLabel: "Web Role Fit",
        confidence: 94,
        alternates: []
      }
    ]);
    mocked.estimateShipCynoChance.mockReturnValue(new Map([
      ["Onyx", { cynoCapable: true, cynoChance: 100 }]
    ]));
    mocked.deriveShipRolePills.mockImplementation((params: any) => {
      params.onEvidence?.("Onyx", [
        {
          pillName: "Web",
          causingModule: "Stasis Webifier II",
          fitId: "111:Web Role Fit",
          killmailId: 9101,
          url: "https://zkillboard.com/loss/9101/",
          timestamp: "2026-02-11T01:00:00Z"
        }
      ]);
      return new Map([
        ["Onyx", ["Web"]]
      ]);
    });
    mocked.deriveShipCynoBaitEvidence.mockReturnValue(new Map([
      [
        "Onyx",
        {
          Cyno: {
            pillName: "Cyno",
            causingModule: "Cynosural Field Generator I",
            fitId: "111:Web Role Fit",
            killmailId: 9102,
            url: "https://zkillboard.com/kill/9102/",
            timestamp: "2026-02-12T01:00:00Z"
          },
          Bait: {
            pillName: "Bait",
            causingModule: "Stasis Webifier II",
            fitId: "111:Web Role Fit",
            killmailId: 9103,
            url: "https://zkillboard.com/kill/9103/",
            timestamp: "2026-02-13T01:00:00Z"
          }
        }
      ]
    ]));

    const debugLog = vi.fn();
    const result = await recomputeDerivedInference({
      row: makePilotCard([], []),
      settings: { lookbackDays: 7 },
      namesById: new Map([
        [111, "Onyx"],
        [526, "Stasis Webifier II"],
        [21096, "Cynosural Field Generator I"]
      ]),
      cacheKey: "derived.pills.test",
      debugLog
    });

    expect(result.predictedShips).toHaveLength(1);
    expect(result.predictedShips[0].rolePills).toEqual(["Web"]);
    expect(result.predictedShips[0].pillEvidence).toEqual({
      Web: {
        pillName: "Web",
        causingModule: "Stasis Webifier II",
        fitId: "111:Web Role Fit",
        killmailId: 9101,
        url: "https://zkillboard.com/loss/9101/",
        timestamp: "2026-02-11T01:00:00Z"
      },
      Cyno: {
        pillName: "Cyno",
        causingModule: "Cynosural Field Generator I",
        fitId: "111:Web Role Fit",
        killmailId: 9102,
        url: "https://zkillboard.com/kill/9102/",
        timestamp: "2026-02-12T01:00:00Z"
      },
      Bait: {
        pillName: "Bait",
        causingModule: "Stasis Webifier II",
        fitId: "111:Web Role Fit",
        killmailId: 9103,
        url: "https://zkillboard.com/kill/9103/",
        timestamp: "2026-02-13T01:00:00Z"
      }
    });

    const pillPayloads = debugLog.mock.calls
      .filter(([message]) => message === "Displayed pill evidence")
      .map(([, payload]) => payload);
    expect(pillPayloads).toHaveLength(3);
    expect(pillPayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pilot: "Pilot Perf",
        ship: "Onyx",
        pillName: "Web",
        causingModule: "Stasis Webifier II",
        fitId: "111:Web Role Fit",
        eventType: "loss",
        killmailId: 9101,
        zkillUrl: "https://zkillboard.com/loss/9101/",
        timestamp: "2026-02-11T01:00:00Z"
      }),
      expect.objectContaining({
        pilot: "Pilot Perf",
        ship: "Onyx",
        pillName: "Cyno",
        causingModule: "Cynosural Field Generator I",
        fitId: "111:Web Role Fit",
        eventType: "kill",
        killmailId: 9102,
        zkillUrl: "https://zkillboard.com/kill/9102/",
        timestamp: "2026-02-12T01:00:00Z"
      }),
      expect.objectContaining({
        pilot: "Pilot Perf",
        ship: "Onyx",
        pillName: "Bait",
        causingModule: "Stasis Webifier II",
        fitId: "111:Web Role Fit",
        eventType: "kill",
        killmailId: 9103,
        zkillUrl: "https://zkillboard.com/kill/9103/",
        timestamp: "2026-02-13T01:00:00Z"
      })
    ]));
  });
});
