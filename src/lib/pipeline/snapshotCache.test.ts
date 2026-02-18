import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedPilotInput } from "../../types";
import type { ZkillKillmail } from "../api/zkill";
import type { PilotProcessedSnapshot } from "./types";

const mocked = vi.hoisted(() => ({
  getCachedStateAsync: vi.fn(async () => ({ value: null, stale: false })),
  setCachedAsync: vi.fn(async () => undefined)
}));

vi.mock("../cache", async () => {
  const actual = await vi.importActual<typeof import("../cache")>("../cache");
  return {
    ...actual,
    getCachedStateAsync: mocked.getCachedStateAsync,
    setCachedAsync: mocked.setCachedAsync
  };
});

import {
  buildPilotSnapshotSourceSignature,
  isPilotSnapshotUsable,
  loadPilotSnapshot,
  savePilotSnapshot
} from "./snapshotCache";

const ENTRY: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

const KILL: ZkillKillmail = {
  killmail_id: 7001,
  killmail_time: "2026-02-17T00:00:00Z",
  victim: {},
  attackers: []
};

function makeSnapshot(version: number, sourceSignature: string): PilotProcessedSnapshot {
  return {
    version,
    pilotKey: "pilot a",
    characterId: 101,
    lookbackDays: 7,
    baseRow: {
      status: "ready",
      fetchPhase: "ready",
      characterId: 101,
      characterName: "Pilot A",
      corporationId: 1001,
      corporationName: "Corp",
      securityStatus: 2.3,
      stats: {
        kills: 10,
        losses: 2,
        kdRatio: 5,
        solo: 0,
        soloRatio: 0,
        iskDestroyed: 0,
        iskLost: 0,
        iskRatio: 0,
        danger: 83
      }
    },
    inferenceKills: [KILL],
    inferenceLosses: [],
    predictedShips: [],
    fitCandidates: [],
    cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] },
    sourceSignature,
    savedAt: Date.now()
  };
}

describe("pipeline/snapshotCache versioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getCachedStateAsync.mockResolvedValue({ value: null, stale: false });
  });

  it("builds source signatures with the v2 namespace", () => {
    const signature = buildPilotSnapshotSourceSignature({
      row: { parsedEntry: ENTRY, inferenceKills: [KILL], inferenceLosses: [] },
      lookbackDays: 7,
      topShips: 5
    });

    expect(signature.startsWith("snapshot-src-v2|")).toBe(true);
  });

  it("uses v2 cache-key namespace and stores v2 snapshots", async () => {
    const expectedKey = "eve-intel.cache.pipeline.snapshot.v2.101.7.pilot a";
    const signature = buildPilotSnapshotSourceSignature({
      row: { parsedEntry: ENTRY, inferenceKills: [KILL], inferenceLosses: [] },
      lookbackDays: 7,
      topShips: 5
    });

    await loadPilotSnapshot({
      pilotName: "Pilot A",
      characterId: 101,
      lookbackDays: 7
    });
    expect(mocked.getCachedStateAsync).toHaveBeenCalledWith(expectedKey);

    await savePilotSnapshot({
      pilotName: "Pilot A",
      characterId: 101,
      lookbackDays: 7,
      baseRow: makeSnapshot(2, signature).baseRow,
      inferenceKills: [KILL],
      inferenceLosses: [],
      predictedShips: [],
      fitCandidates: [],
      cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] },
      sourceSignature: signature
    });

    expect(mocked.setCachedAsync).toHaveBeenCalledWith(
      expectedKey,
      expect.objectContaining({
        version: 2,
        pilotKey: "pilot a"
      }),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("rejects snapshots from the previous schema version", () => {
    const signature = buildPilotSnapshotSourceSignature({
      row: { parsedEntry: ENTRY, inferenceKills: [KILL], inferenceLosses: [] },
      lookbackDays: 7,
      topShips: 5
    });
    const previousSnapshot = makeSnapshot(1, signature);

    expect(
      isPilotSnapshotUsable(previousSnapshot, {
        pilotName: "Pilot A",
        characterId: 101,
        lookbackDays: 7,
        sourceSignature: signature
      })
    ).toBe(false);
  });
});
