import { describe, expect, it, vi } from "vitest";
import { hydrateBaseCards, runBreadthPilotPipeline, runPagedHistoryRounds } from "./breadthPipeline";
import type { ParsedPilotInput } from "../../types";
import type { PilotCard } from "../usePilotIntelPipeline";
import type { ZkillKillmail } from "../api/zkill";
import { buildPilotSnapshotSourceSignature, isPilotSnapshotUsable } from "./snapshotCache";

const ENTRY_A: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

const ENTRY_B: ParsedPilotInput = {
  pilotName: "Pilot B",
  sourceLine: "Pilot B",
  parseConfidence: 1,
  shipSource: "inferred"
};

const ENTRY_C: ParsedPilotInput = {
  pilotName: "Pilot C",
  sourceLine: "Pilot C",
  parseConfidence: 1,
  shipSource: "inferred"
};

function makeStageOneRow(entry: ParsedPilotInput, characterId: number): PilotCard {
  return {
    parsedEntry: entry,
    status: "ready",
    fetchPhase: "base",
    characterId,
    characterName: entry.pilotName,
    corporationId: 100,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

function makePilotState(entry: ParsedPilotInput, characterId: number, danger: number) {
  return {
    entry,
    characterId,
    danger,
    threatTier: danger > 75 ? "high" as const : "normal" as const,
    nextKillsPage: 1,
    nextLossesPage: 1,
    character: { character_id: characterId, corporation_id: 1000 + characterId, name: entry.pilotName },
    stageOneRow: {
      ...makeStageOneRow(entry, characterId),
      stats: {
        kills: 0,
        losses: 0,
        kdRatio: 0,
        solo: 0,
        soloRatio: 0,
        iskDestroyed: 0,
        iskLost: 0,
        iskRatio: 0,
        danger
      }
    },
    historyKills: new Map<number, { killmail_id: number; killmail_time: string; victim: {}; attackers: [] }>(),
    historyLosses: new Map<number, { killmail_id: number; killmail_time: string; victim: {}; attackers: [] }>(),
    exhaustedKills: false,
    exhaustedLosses: false,
    lastMaterialSignature: ""
  };
}

describe("pipeline/breadthPipeline", () => {
  it("hydrates base cards and does not block other pilots when one base fetch fails", async () => {
    const updatePilotCard = vi.fn();
    const tasks = [
      { entry: ENTRY_A, characterId: 101 },
      { entry: ENTRY_B, characterId: 102 }
    ];

    const pilots = await hydrateBaseCards(
      {
        tasks,
        lookbackDays: 7,
        topShips: 5,
        signal: undefined,
        onRetry: () => () => undefined,
        isCancelled: () => false,
        updatePilotCard,
        logDebug: vi.fn(),
        logError: vi.fn()
      },
      {
        fetchCharacterPublic: vi.fn(async (id: number) => {
          if (id === 102) {
            throw new Error("boom");
          }
          return { character_id: id, name: "Pilot A", corporation_id: 1001 };
        }),
        fetchCharacterStats: vi.fn(async () => ({ kills: 10, losses: 2 })),
        resolveUniverseNames: vi.fn(async () => new Map<number, string>()),
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
        mergePilotStats: vi.fn(({ zkillStats }) => ({
          kills: zkillStats?.kills ?? 0,
          losses: zkillStats?.losses ?? 0,
          kdRatio: 0,
          solo: 0,
          soloRatio: 0,
          iskDestroyed: 0,
          iskLost: 0,
          iskRatio: 0,
          danger: 0
        })),
        buildStageOneRow: vi.fn((params: { entry: ParsedPilotInput; characterId: number }) =>
          makeStageOneRow(params.entry, params.characterId)
        ),
        createErrorCard: vi.fn((entry: ParsedPilotInput, error: string) => ({
          ...makeStageOneRow(entry, 0),
          status: "error" as const,
          fetchPhase: "error" as const,
          error
        })),
        fetchLatestKillsPage: vi.fn(),
        fetchLatestLossesPage: vi.fn(),
        mergeKillmailLists: vi.fn(),
        collectStageNameResolutionIds: vi.fn(),
        resolveNamesSafely: vi.fn(),
        buildStageTwoRow: vi.fn(),
        recomputeDerivedInference: vi.fn(),
        ensureExplicitShipTypeId: vi.fn(),
        isAbortError: vi.fn(() => false)
      }
    );

    expect(pilots).toHaveLength(1);
    expect(updatePilotCard).toHaveBeenCalledWith(
      "Pilot A",
      expect.objectContaining({ fetchPhase: "base", status: "ready" })
    );
    expect(updatePilotCard).toHaveBeenCalledWith(
      "Pilot B",
      expect.objectContaining({ status: "error", fetchPhase: "error" })
    );
  });

  it("applies usable processed snapshot immediately during base hydration", async () => {
    const updatePilotCard = vi.fn();
    const tasks = [{ entry: ENTRY_A, characterId: 101 }];
    const inferenceKills: ZkillKillmail[] = [{
      killmail_id: 7001,
      killmail_time: "2026-02-17T00:00:00Z",
      victim: {},
      attackers: []
    }];
    const inferenceLosses: ZkillKillmail[] = [{
      killmail_id: 8001,
      killmail_time: "2026-02-16T00:00:00Z",
      victim: {},
      attackers: []
    }];

    const sourceSignature = buildPilotSnapshotSourceSignature({
      row: { parsedEntry: ENTRY_A, inferenceKills, inferenceLosses },
      lookbackDays: 7,
      topShips: 5
    });

    const pilots = await hydrateBaseCards(
      {
        tasks,
        lookbackDays: 7,
        topShips: 5,
        signal: undefined,
        onRetry: () => () => undefined,
        isCancelled: () => false,
        updatePilotCard,
        logDebug: vi.fn(),
        logError: vi.fn()
      },
      {
        fetchCharacterPublic: vi.fn(async (id: number) => ({ character_id: id, name: "Pilot A", corporation_id: 1001 })),
        fetchCharacterStats: vi.fn(async () => ({ kills: 10, losses: 2, danger: 83 })),
        resolveUniverseNames: vi.fn(async () => new Map<number, string>()),
        derivePilotStats: vi.fn(() => ({
          kills: 0, losses: 0, kdRatio: 0, solo: 0, soloRatio: 0, iskDestroyed: 0, iskLost: 0, iskRatio: 0, danger: 0
        })),
        mergePilotStats: vi.fn(({ zkillStats }) => ({
          kills: zkillStats?.kills ?? 0,
          losses: zkillStats?.losses ?? 0,
          kdRatio: 0,
          solo: 0,
          soloRatio: 0,
          iskDestroyed: 0,
          iskLost: 0,
          iskRatio: 0,
          danger: zkillStats?.danger ?? 0
        })),
        buildStageOneRow: vi.fn((params: { entry: ParsedPilotInput; characterId: number }) =>
          makeStageOneRow(params.entry, params.characterId)
        ),
        createErrorCard: vi.fn(),
        fetchLatestKillsPage: vi.fn(),
        fetchLatestLossesPage: vi.fn(),
        mergeKillmailLists: vi.fn((a: ZkillKillmail[], b: ZkillKillmail[]) => [...a, ...b]),
        collectStageNameResolutionIds: vi.fn(),
        resolveNamesSafely: vi.fn(),
        buildStageTwoRow: vi.fn(),
        recomputeDerivedInference: vi.fn(),
        ensureExplicitShipTypeId: vi.fn(),
        loadPilotSnapshot: vi.fn(async () => ({
          snapshot: {
            version: 1,
            pilotKey: "pilot a",
            characterId: 101,
            lookbackDays: 7,
            baseRow: {
              status: "ready" as const,
              fetchPhase: "ready" as const,
              characterId: 101,
              characterName: "Pilot A",
              corporationId: 1001,
              corporationName: "Corp",
              allianceId: undefined,
              allianceName: undefined,
              securityStatus: 2.3,
              stats: {
                kills: 10, losses: 2, kdRatio: 5, solo: 0, soloRatio: 0, iskDestroyed: 0, iskLost: 0, iskRatio: 0, danger: 83
              }
            },
            inferenceKills,
            inferenceLosses,
            predictedShips: [],
            fitCandidates: [],
            cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] },
            sourceSignature,
            savedAt: Date.now()
          },
          stale: false
        })),
        savePilotSnapshot: vi.fn(),
        buildPilotSnapshotSourceSignature,
        isPilotSnapshotUsable,
        isAbortError: vi.fn(() => false)
      }
    );

    expect(updatePilotCard).toHaveBeenCalledWith("Pilot A", expect.objectContaining({ fetchPhase: "ready" }));
    expect(pilots[0]?.historyKills.size).toBe(1);
    expect(pilots[0]?.historyLosses.size).toBe(1);
  });

  it("serves stale snapshot immediately (SWR) and continues pipeline", async () => {
    const updatePilotCard = vi.fn();
    const tasks = [{ entry: ENTRY_A, characterId: 101 }];
    const inferenceKills: ZkillKillmail[] = [{
      killmail_id: 7001,
      killmail_time: "2026-02-17T00:00:00Z",
      victim: {},
      attackers: []
    }];
    const sourceSignature = buildPilotSnapshotSourceSignature({
      row: { parsedEntry: ENTRY_A, inferenceKills, inferenceLosses: [] },
      lookbackDays: 7,
      topShips: 5
    });

    const pilots = await hydrateBaseCards(
      {
        tasks,
        lookbackDays: 7,
        topShips: 5,
        signal: undefined,
        onRetry: () => () => undefined,
        isCancelled: () => false,
        updatePilotCard,
        logDebug: vi.fn(),
        logError: vi.fn()
      },
      {
        fetchCharacterPublic: vi.fn(async (id: number) => ({ character_id: id, name: "Pilot A", corporation_id: 1001 })),
        fetchCharacterStats: vi.fn(async () => ({ kills: 10, losses: 2, danger: 83 })),
        resolveUniverseNames: vi.fn(async () => new Map<number, string>()),
        derivePilotStats: vi.fn(() => ({
          kills: 0, losses: 0, kdRatio: 0, solo: 0, soloRatio: 0, iskDestroyed: 0, iskLost: 0, iskRatio: 0, danger: 0
        })),
        mergePilotStats: vi.fn(({ zkillStats }) => ({
          kills: zkillStats?.kills ?? 0,
          losses: zkillStats?.losses ?? 0,
          kdRatio: 0,
          solo: 0,
          soloRatio: 0,
          iskDestroyed: 0,
          iskLost: 0,
          iskRatio: 0,
          danger: zkillStats?.danger ?? 0
        })),
        buildStageOneRow: vi.fn((params: { entry: ParsedPilotInput; characterId: number }) =>
          makeStageOneRow(params.entry, params.characterId)
        ),
        createErrorCard: vi.fn(),
        fetchLatestKillsPage: vi.fn(),
        fetchLatestLossesPage: vi.fn(),
        mergeKillmailLists: vi.fn((a: ZkillKillmail[], b: ZkillKillmail[]) => [...a, ...b]),
        collectStageNameResolutionIds: vi.fn(),
        resolveNamesSafely: vi.fn(),
        buildStageTwoRow: vi.fn(),
        recomputeDerivedInference: vi.fn(),
        ensureExplicitShipTypeId: vi.fn(),
        loadPilotSnapshot: vi.fn(async () => ({
          snapshot: {
            version: 1,
            pilotKey: "pilot a",
            characterId: 101,
            lookbackDays: 7,
            baseRow: {
              status: "ready" as const,
              fetchPhase: "ready" as const,
              characterId: 101,
              characterName: "Pilot A",
              corporationId: 1001,
              corporationName: "Corp",
              allianceId: undefined,
              allianceName: undefined,
              securityStatus: 2.3,
              stats: {
                kills: 10, losses: 2, kdRatio: 5, solo: 0, soloRatio: 0, iskDestroyed: 0, iskLost: 0, iskRatio: 0, danger: 83
              }
            },
            inferenceKills,
            inferenceLosses: [],
            predictedShips: [],
            fitCandidates: [],
            cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] },
            sourceSignature,
            savedAt: Date.now()
          },
          stale: true
        })),
        savePilotSnapshot: vi.fn(),
        buildPilotSnapshotSourceSignature,
        isPilotSnapshotUsable,
        isAbortError: vi.fn(() => false)
      }
    );

    expect(updatePilotCard).toHaveBeenCalledWith("Pilot A", expect.objectContaining({ fetchPhase: "ready" }));
    expect(pilots).toHaveLength(1);
  });

  it("invalidates snapshot when source signature mismatches", async () => {
    const updatePilotCard = vi.fn();
    const tasks = [{ entry: ENTRY_A, characterId: 101 }];
    const inferenceKills: ZkillKillmail[] = [{
      killmail_id: 7001,
      killmail_time: "2026-02-17T00:00:00Z",
      victim: {},
      attackers: []
    }];

    await hydrateBaseCards(
      {
        tasks,
        lookbackDays: 7,
        topShips: 5,
        signal: undefined,
        onRetry: () => () => undefined,
        isCancelled: () => false,
        updatePilotCard,
        logDebug: vi.fn(),
        logError: vi.fn()
      },
      {
        fetchCharacterPublic: vi.fn(async (id: number) => ({ character_id: id, name: "Pilot A", corporation_id: 1001 })),
        fetchCharacterStats: vi.fn(async () => ({ kills: 10, losses: 2, danger: 83 })),
        resolveUniverseNames: vi.fn(async () => new Map<number, string>()),
        derivePilotStats: vi.fn(() => ({
          kills: 0, losses: 0, kdRatio: 0, solo: 0, soloRatio: 0, iskDestroyed: 0, iskLost: 0, iskRatio: 0, danger: 0
        })),
        mergePilotStats: vi.fn(({ zkillStats }) => ({
          kills: zkillStats?.kills ?? 0,
          losses: zkillStats?.losses ?? 0,
          kdRatio: 0,
          solo: 0,
          soloRatio: 0,
          iskDestroyed: 0,
          iskLost: 0,
          iskRatio: 0,
          danger: zkillStats?.danger ?? 0
        })),
        buildStageOneRow: vi.fn((params: { entry: ParsedPilotInput; characterId: number }) =>
          makeStageOneRow(params.entry, params.characterId)
        ),
        createErrorCard: vi.fn(),
        fetchLatestKillsPage: vi.fn(),
        fetchLatestLossesPage: vi.fn(),
        mergeKillmailLists: vi.fn((a: ZkillKillmail[], b: ZkillKillmail[]) => [...a, ...b]),
        collectStageNameResolutionIds: vi.fn(),
        resolveNamesSafely: vi.fn(),
        buildStageTwoRow: vi.fn(),
        recomputeDerivedInference: vi.fn(),
        ensureExplicitShipTypeId: vi.fn(),
        loadPilotSnapshot: vi.fn(async () => ({
          snapshot: {
            version: 1,
            pilotKey: "pilot a",
            characterId: 101,
            lookbackDays: 7,
            baseRow: {
              status: "ready" as const,
              fetchPhase: "ready" as const,
              characterId: 101,
              characterName: "Pilot A",
              corporationId: 1001,
              corporationName: "Corp",
              allianceId: undefined,
              allianceName: undefined,
              securityStatus: 2.3,
              stats: {
                kills: 10, losses: 2, kdRatio: 5, solo: 0, soloRatio: 0, iskDestroyed: 0, iskLost: 0, iskRatio: 0, danger: 83
              }
            },
            inferenceKills,
            inferenceLosses: [],
            predictedShips: [],
            fitCandidates: [],
            cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] },
            sourceSignature: "mismatch",
            savedAt: Date.now()
          },
          stale: false
        })),
        savePilotSnapshot: vi.fn(),
        buildPilotSnapshotSourceSignature,
        isPilotSnapshotUsable,
        isAbortError: vi.fn(() => false)
      }
    );

    const readyCall = updatePilotCard.mock.calls.find((call) => call[1]?.fetchPhase === "ready");
    expect(readyCall).toBeUndefined();
  });

  it("runs weighted paging and gives high-threat pilots deeper pages sooner", async () => {
    const callOrder: string[] = [];
    const updatePilotCard = vi.fn();
    const pilotA = makePilotState(ENTRY_A, 101, 80);
    const pilotB = makePilotState(ENTRY_B, 102, 75);

    const mk = (id: number): ZkillKillmail => ({
      killmail_id: id,
      killmail_time: "2026-02-17T00:00:00Z",
      victim: {},
      attackers: []
    });
    await runPagedHistoryRounds(
      {
        pilots: [pilotA, pilotB],
        lookbackDays: 7,
        topShips: 5,
        maxPages: 3,
        signal: undefined,
        onRetry: () => () => undefined,
        isCancelled: () => false,
        updatePilotCard,
        logDebug: vi.fn()
      },
      {
        fetchCharacterPublic: vi.fn(),
        fetchCharacterStats: vi.fn(),
        resolveUniverseNames: vi.fn(),
        derivePilotStats: vi.fn(),
        mergePilotStats: vi.fn(),
        buildStageOneRow: vi.fn(),
        createErrorCard: vi.fn(),
        fetchLatestKillsPage: vi.fn(async (characterId: number, page: number) => {
          callOrder.push(`k-${characterId}-p${page}`);
          if (page === 1) {
            return [mk(characterId * 10 + page)];
          }
          if (page === 2 && characterId === 101) {
            return [mk(characterId * 10 + page)];
          }
          return [];
        }),
        fetchLatestLossesPage: vi.fn(async (characterId: number, page: number) => {
          callOrder.push(`l-${characterId}-p${page}`);
          if (page === 1) {
            return [mk(characterId * 100 + page)];
          }
          return [];
        }),
        mergeKillmailLists: vi.fn((a: ZkillKillmail[], b: ZkillKillmail[]) => [...a, ...b]),
        collectStageNameResolutionIds: vi.fn(() => []),
        resolveNamesSafely: vi.fn(async () => new Map<number, string>()),
        buildStageTwoRow: vi.fn((params: { stageOne: PilotCard; inferenceKills: ZkillKillmail[]; inferenceLosses: ZkillKillmail[] }) => ({
          ...params.stageOne,
          inferenceKills: params.inferenceKills,
          inferenceLosses: params.inferenceLosses
        })),
        recomputeDerivedInference: vi.fn(async () => ({
          predictedShips: [],
          fitCandidates: [],
          cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] }
        })),
        ensureExplicitShipTypeId: vi.fn(async () => undefined),
        isAbortError: vi.fn(() => false)
      }
    );

    const firstRoundEnd = Math.max(
      ...callOrder
        .map((value, index) => ({ value, index }))
        .filter((row) => row.value.includes("p1"))
        .map((row) => row.index)
    );
    const firstRoundTwo = callOrder.findIndex((value) => value.includes("p2"));
    const highPilotPageTwo = callOrder.findIndex((value) => value.includes("-101-p2"));
    const normalPilotPageTwo = callOrder.findIndex((value) => value.includes("-102-p2"));
    expect(firstRoundTwo).toBeGreaterThan(firstRoundEnd);
    expect(highPilotPageTwo).toBeGreaterThan(-1);
    if (normalPilotPageTwo >= 0) {
      expect(highPilotPageTwo).toBeLessThan(normalPilotPageTwo);
    }
    expect(updatePilotCard).toHaveBeenCalledWith("Pilot A", expect.objectContaining({ fetchPhase: "ready" }));
    expect(updatePilotCard).toHaveBeenCalledWith("Pilot B", expect.objectContaining({ fetchPhase: "ready" }));
  });

  it("treats danger 75 as normal and danger >75 as high; NaN is normal", async () => {
    const callOrder: string[] = [];
    const mk = (id: number): ZkillKillmail => ({
      killmail_id: id,
      killmail_time: "2026-02-17T00:00:00Z",
      victim: {},
      attackers: []
    });
    await runPagedHistoryRounds(
      {
        pilots: [
          makePilotState(ENTRY_A, 201, 75),
          makePilotState(ENTRY_B, 202, 75.1),
          makePilotState(ENTRY_C, 203, Number.NaN)
        ],
        lookbackDays: 7,
        topShips: 5,
        maxPages: 3,
        signal: undefined,
        onRetry: () => () => undefined,
        isCancelled: () => false,
        updatePilotCard: vi.fn(),
        logDebug: vi.fn()
      },
      {
        fetchCharacterPublic: vi.fn(),
        fetchCharacterStats: vi.fn(),
        resolveUniverseNames: vi.fn(),
        derivePilotStats: vi.fn(),
        mergePilotStats: vi.fn(),
        buildStageOneRow: vi.fn(),
        createErrorCard: vi.fn(),
        fetchLatestKillsPage: vi.fn(async (characterId: number, page: number) => {
          callOrder.push(`k-${characterId}-p${page}`);
          if (page === 1) {
            return characterId === 202 ? [mk(characterId * 10 + page)] : [];
          }
          return [];
        }),
        fetchLatestLossesPage: vi.fn(async (characterId: number, page: number) => {
          callOrder.push(`l-${characterId}-p${page}`);
          if (page === 1) {
            return characterId === 202 ? [mk(characterId * 100 + page)] : [];
          }
          return [];
        }),
        mergeKillmailLists: vi.fn((a: ZkillKillmail[], b: ZkillKillmail[]) => [...a, ...b]),
        collectStageNameResolutionIds: vi.fn(() => []),
        resolveNamesSafely: vi.fn(async () => new Map<number, string>()),
        buildStageTwoRow: vi.fn((params: { stageOne: PilotCard; inferenceKills: ZkillKillmail[]; inferenceLosses: ZkillKillmail[] }) => ({
          ...params.stageOne,
          inferenceKills: params.inferenceKills,
          inferenceLosses: params.inferenceLosses
        })),
        recomputeDerivedInference: vi.fn(async () => ({
          predictedShips: [],
          fitCandidates: [],
          cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] }
        })),
        ensureExplicitShipTypeId: vi.fn(async () => undefined),
        isAbortError: vi.fn(() => false)
      }
    );

    expect(callOrder.some((value) => value.includes("-202-p2"))).toBe(true);
    expect(callOrder.some((value) => value.includes("-201-p2"))).toBe(false);
    expect(callOrder.some((value) => value.includes("-203-p2"))).toBe(false);
  });

  it("integrates base hydration and rounds end-to-end through runBreadthPilotPipeline", async () => {
    const updatePilotCard = vi.fn();
    const tasks = [{ entry: ENTRY_A, characterId: 101 }];

    await runBreadthPilotPipeline(
      {
        tasks,
        lookbackDays: 7,
        topShips: 5,
        maxPages: 2,
        signal: undefined,
        onRetry: () => () => undefined,
        isCancelled: () => false,
        updatePilotCard,
        logDebug: vi.fn(),
        logError: vi.fn()
      },
      {
        fetchCharacterPublic: vi.fn(async () => ({ character_id: 101, name: "Pilot A", corporation_id: 1001 })),
        fetchCharacterStats: vi.fn(async () => ({ kills: 20, losses: 5 })),
        resolveUniverseNames: vi.fn(async () => new Map<number, string>()),
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
        mergePilotStats: vi.fn(() => ({
          kills: 20,
          losses: 5,
          kdRatio: 4,
          solo: 0,
          soloRatio: 0,
          iskDestroyed: 0,
          iskLost: 0,
          iskRatio: 0,
          danger: 80
        })),
        buildStageOneRow: vi.fn((params: { entry: ParsedPilotInput; characterId: number }) =>
          makeStageOneRow(params.entry, params.characterId)
        ),
        createErrorCard: vi.fn(),
        fetchLatestKillsPage: vi.fn(async () => []),
        fetchLatestLossesPage: vi.fn(async () => []),
        mergeKillmailLists: vi.fn((a: ZkillKillmail[], b: ZkillKillmail[]) => [...a, ...b]),
        collectStageNameResolutionIds: vi.fn(() => []),
        resolveNamesSafely: vi.fn(async () => new Map<number, string>()),
        buildStageTwoRow: vi.fn((params: { stageOne: PilotCard }) => params.stageOne),
        recomputeDerivedInference: vi.fn(async () => ({
          predictedShips: [],
          fitCandidates: [],
          cynoRisk: { potentialCyno: false, jumpAssociation: false, reasons: [] }
        })),
        ensureExplicitShipTypeId: vi.fn(async () => undefined),
        isAbortError: vi.fn(() => false)
      }
    );

    expect(updatePilotCard).toHaveBeenCalledWith("Pilot A", expect.objectContaining({ fetchPhase: "base" }));
    expect(updatePilotCard).toHaveBeenLastCalledWith("Pilot A", expect.objectContaining({ fetchPhase: "ready" }));
  });
});
