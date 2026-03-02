import { describe, expect, it, vi } from "vitest";
import { loadDerivedInferenceWithCache } from "./derivedInference";
import type { CacheLookup } from "../cache";
import type { PilotCard } from "../pilotDomain";
import type { DerivedInference } from "./executors";

function makePilotCard(): PilotCard {
  return {
    parsedEntry: {
      pilotName: "Pilot A",
      sourceLine: "Pilot A",
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "ready",
    characterId: 101,
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

function makeDerived(): DerivedInference {
  return {
    predictedShips: [],
    fitCandidates: [],
    cynoRisk: {
      potentialCyno: false,
      jumpAssociation: false,
      reasons: []
    }
  };
}

function asGenericCachedStateLookup<TCached>(
  lookup: (key: string) => Promise<CacheLookup<TCached>>
): <T>(key: string) => Promise<CacheLookup<T>> {
  return lookup as unknown as <T>(key: string) => Promise<CacheLookup<T>>;
}

describe("pipeline/derivedInference", () => {
  it("returns usable cache hit without recompute", async () => {
    const cached = makeDerived();
    const recompute = vi.fn(async () => makeDerived());
    const logDebug = vi.fn();
    const getCachedStateAsync = asGenericCachedStateLookup(async (_key: string) =>
      ({ value: cached, stale: false }));
    const result = await loadDerivedInferenceWithCache(
      {
        row: makePilotCard(),
        settings: { lookbackDays: 7 },
        namesById: new Map(),
        topShips: 5,
        logDebug
      },
      {
        buildDerivedInferenceKey: vi.fn(() => "k"),
        getCachedStateAsync,
        isDerivedInferenceUsable: vi.fn(() => true),
        recomputeDerivedInference: recompute
      }
    );

    expect(result).toBe(cached);
    expect(recompute).not.toHaveBeenCalled();
    expect(logDebug).toHaveBeenCalledWith("Derived inference cache hit", {
      pilot: "Pilot A",
      stale: false,
      predicted: 0
    });
  });

  it("returns stale cache hit and triggers background recompute", async () => {
    const cached = makeDerived();
    const recompute = vi.fn(async () => makeDerived());
    const getCachedStateAsync = asGenericCachedStateLookup(async (_key: string) =>
      ({ value: cached, stale: true }));
    const result = await loadDerivedInferenceWithCache(
      {
        row: makePilotCard(),
        settings: { lookbackDays: 7 },
        namesById: new Map(),
        topShips: 5,
        logDebug: vi.fn()
      },
      {
        buildDerivedInferenceKey: vi.fn(() => "k2"),
        getCachedStateAsync,
        isDerivedInferenceUsable: vi.fn(() => true),
        recomputeDerivedInference: recompute
      }
    );

    expect(result).toBe(cached);
    expect(recompute).toHaveBeenCalledTimes(1);
  });

  it("recomputes when cache missing or unusable", async () => {
    const recomputed = makeDerived();
    const recompute = vi.fn(async () => recomputed);
    const logDebug = vi.fn();
    const getCachedStateAsync = asGenericCachedStateLookup<DerivedInference>(async (_key: string) =>
      ({ value: null, stale: false }));
    const result = await loadDerivedInferenceWithCache(
      {
        row: makePilotCard(),
        settings: { lookbackDays: 7 },
        namesById: new Map(),
        topShips: 5,
        logDebug
      },
      {
        buildDerivedInferenceKey: vi.fn(() => "k3"),
        getCachedStateAsync,
        isDerivedInferenceUsable: vi.fn(() => false),
        recomputeDerivedInference: recompute
      }
    );

    expect(result).toBe(recomputed);
    expect(recompute).toHaveBeenCalledTimes(1);
    expect(logDebug).toHaveBeenCalledWith("Derived inference cache miss/recompute", {
      pilot: "Pilot A"
    });
  });
});
