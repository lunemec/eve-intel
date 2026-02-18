/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePilotIntelPipeline } from "./usePilotIntelPipeline";
import {
  fetchCharacterPublic,
  resolveCharacterIds,
  resolveInventoryTypeIdByName,
  resolveUniverseNames
} from "./api/esi";
import {
  fetchCharacterStats,
  fetchLatestKills,
  fetchLatestKillsPage,
  fetchLatestKillsPaged,
  fetchLatestLosses,
  fetchLatestLossesPage,
  fetchLatestLossesPaged,
  fetchRecentKills,
  fetchRecentLosses
} from "./api/zkill";
import { getCachedStateAsync, setCachedAsync } from "./cache";
import { deriveFitCandidates, derivePilotStats, deriveShipPredictions } from "./intel";
import { deriveShipCynoBaitEvidence, evaluateCynoRisk, estimateShipCynoChance } from "./cyno";
import { deriveShipRolePills } from "./roles";

vi.mock("./api/esi", () => ({
  fetchCharacterPublic: vi.fn(),
  resolveCharacterIds: vi.fn(),
  resolveInventoryTypeIdByName: vi.fn(),
  resolveUniverseNames: vi.fn()
}));

vi.mock("./api/zkill", () => ({
  fetchCharacterStats: vi.fn(),
  fetchLatestKills: vi.fn(),
  fetchLatestKillsPage: vi.fn(),
  fetchLatestKillsPaged: vi.fn(),
  fetchLatestLosses: vi.fn(),
  fetchLatestLossesPage: vi.fn(),
  fetchLatestLossesPaged: vi.fn(),
  fetchRecentKills: vi.fn(),
  fetchRecentLosses: vi.fn()
}));

vi.mock("./cache", () => ({
  getCachedStateAsync: vi.fn(),
  setCachedAsync: vi.fn()
}));

vi.mock("./names", () => ({
  withDogmaTypeNameFallback: (ids: number[], namesById: Map<number, string>) => ({
    namesById: new Map(ids.map((id) => [id, namesById.get(id) ?? `Type ${id}`])),
    backfilledCount: 0
  })
}));

vi.mock("./intel", () => ({
  collectItemTypeIds: vi.fn(() => []),
  collectShipTypeIdsForNaming: vi.fn(() => []),
  deriveFitCandidates: vi.fn(() => []),
  derivePilotStats: vi.fn(() => ({
    kills: 0,
    losses: 0,
    kdRatio: 0,
    solo: 0,
    soloRatio: 0,
    iskDestroyed: 0,
    iskLost: 0,
    iskRatio: 0,
    danger: 0
  })),
  deriveShipPredictions: vi.fn(() => []),
  summarizeEvidenceCoverage: vi.fn(() => ({
    totalKills: 0,
    totalLosses: 0,
    killRowsWithMatchedAttackerShip: 0,
    killRowsWithoutAttackers: 0,
    killRowsWithAttackersButNoCharacterMatch: 0,
    lossRowsWithVictimShip: 0
  })),
  summarizeTopEvidenceShips: vi.fn(() => [])
}));

vi.mock("./roles", () => ({
  deriveShipRolePills: vi.fn(() => new Map())
}));

vi.mock("./cyno", () => ({
  evaluateCynoRisk: vi.fn(() => ({
    potentialCyno: false,
    jumpAssociation: false,
    reasons: []
  })),
  estimateShipCynoChance: vi.fn(() => new Map()),
  deriveShipCynoBaitEvidence: vi.fn(() => new Map())
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ENTRY = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred" as const
};
const ENTRIES = [ENTRY];
const SETTINGS = { lookbackDays: 7 };

describe("usePilotIntelPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveCharacterIds).mockResolvedValue(new Map([["pilot a", 101]]));
    vi.mocked(fetchCharacterPublic).mockResolvedValue({
      character_id: 101,
      name: "Pilot A",
      corporation_id: 123,
      alliance_id: 456,
      security_status: 2.1
    });
    vi.mocked(fetchRecentKills).mockResolvedValue([]);
    vi.mocked(fetchRecentLosses).mockResolvedValue([]);
    vi.mocked(fetchLatestKills).mockResolvedValue([]);
    vi.mocked(fetchLatestLosses).mockResolvedValue([]);
    vi.mocked(fetchLatestKillsPage).mockResolvedValue([]);
    vi.mocked(fetchLatestLossesPage).mockResolvedValue([]);
    vi.mocked(fetchLatestKillsPaged).mockResolvedValue([]);
    vi.mocked(fetchLatestLossesPaged).mockResolvedValue([]);
    vi.mocked(fetchCharacterStats).mockResolvedValue(null);
    vi.mocked(resolveUniverseNames).mockResolvedValue(new Map([
      [123, "Corp A"],
      [456, "Alliance A"]
    ]));
    vi.mocked(resolveInventoryTypeIdByName).mockResolvedValue(undefined);
    vi.mocked(getCachedStateAsync).mockResolvedValue({ value: null, stale: false });
    vi.mocked(setCachedAsync).mockResolvedValue();
    vi.mocked(deriveShipPredictions).mockReturnValue([]);
    vi.mocked(deriveFitCandidates).mockReturnValue([]);
    vi.mocked(derivePilotStats).mockReturnValue({
      kills: 0,
      losses: 0,
      kdRatio: 0,
      solo: 0,
      soloRatio: 0,
      iskDestroyed: 0,
      iskLost: 0,
      iskRatio: 0,
      danger: 0
    });
    vi.mocked(deriveShipRolePills).mockReturnValue(new Map());
    vi.mocked(estimateShipCynoChance).mockReturnValue(new Map());
    vi.mocked(deriveShipCynoBaitEvidence).mockReturnValue(new Map());
    vi.mocked(evaluateCynoRisk).mockReturnValue({
      potentialCyno: false,
      jumpAssociation: false,
      reasons: []
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks unresolved entries as error cards", async () => {
    vi.mocked(resolveCharacterIds).mockResolvedValue(new Map());
    const { result } = renderHook(() =>
      usePilotIntelPipeline({
        entries: ENTRIES,
        settings: SETTINGS,
        dogmaIndex: null,
        logDebug: vi.fn()
      })
    );

    await waitFor(() => {
      expect(result.current.pilotCards).toHaveLength(1);
      expect(result.current.pilotCards[0].status).toBe("error");
    });
    expect(result.current.pilotCards[0].error).toContain("Character not found in ESI");
  });

  it("transitions from loading to base/history to ready", async () => {
    const deepKills = deferred<[]>();
    const deepLosses = deferred<[]>();
    vi.mocked(fetchLatestKillsPage).mockImplementation((_characterId, page) =>
      page === 1 ? deepKills.promise : Promise.resolve([])
    );
    vi.mocked(fetchLatestLossesPage).mockImplementation((_characterId, page) =>
      page === 1 ? deepLosses.promise : Promise.resolve([])
    );

    const { result } = renderHook(() =>
      usePilotIntelPipeline({
        entries: ENTRIES,
        settings: SETTINGS,
        dogmaIndex: null,
        logDebug: vi.fn()
      })
    );

    await waitFor(() => {
      expect(result.current.pilotCards[0]?.fetchPhase).toBe("base");
    });

    deepKills.resolve([]);
    deepLosses.resolve([]);

    await waitFor(() => {
      expect(result.current.pilotCards[0]?.fetchPhase).toBe("ready");
      expect(result.current.pilotCards[0]?.status).toBe("ready");
    });
  });

  it("aborts in-flight requests on unmount", async () => {
    let observedSignal: AbortSignal | undefined;
    const publicDeferred = deferred<{
      character_id: number;
      name: string;
      corporation_id: number;
      alliance_id: number;
      security_status: number;
    }>();
    vi.mocked(fetchCharacterPublic).mockImplementation((_characterId, signal, _onRetry) => {
      observedSignal = signal;
      return publicDeferred.promise;
    });

    const { unmount } = renderHook(() =>
      usePilotIntelPipeline({
        entries: ENTRIES,
        settings: SETTINGS,
        dogmaIndex: null,
        logDebug: vi.fn()
      })
    );

    await waitFor(() => {
      expect(fetchCharacterPublic).toHaveBeenCalledTimes(1);
    });

    unmount();
    expect(observedSignal?.aborted).toBe(true);
    publicDeferred.resolve({
      character_id: 101,
      name: "Pilot A",
      corporation_id: 123,
      alliance_id: 456,
      security_status: 2.1
    });
  });
});
