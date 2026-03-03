/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupPresentation } from "./appViewModel";
import type { ZkillKillmail } from "./api/zkill";
import type { PilotCard } from "./pilotDomain";

const mocked = vi.hoisted(() => ({
  getCachedStateAsync: vi.fn(async () => ({ value: null, stale: false })),
  setCachedAsync: vi.fn(async () => undefined)
}));

vi.mock("./cache", async () => {
  const actual = await vi.importActual<typeof import("./cache")>("./cache");
  return {
    ...actual,
    getCachedStateAsync: mocked.getCachedStateAsync,
    setCachedAsync: mocked.setCachedAsync
  };
});

import {
  buildFleetGroupingArtifactKey,
  buildFleetGroupingArtifactSourceSignature,
  isFleetGroupingArtifactUsable,
  loadFleetGroupingArtifact,
  saveFleetGroupingArtifact
} from "./fleetGroupingCache";

function pilot(overrides: Partial<PilotCard> = {}): PilotCard {
  return {
    parsedEntry: {
      pilotName: "Pilot",
      sourceLine: "Pilot",
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

function killmail(killmailId: number): ZkillKillmail {
  return {
    killmail_id: killmailId,
    killmail_time: "2026-03-03T00:00:00Z",
    victim: {},
    attackers: []
  };
}

describe("fleetGroupingCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getCachedStateAsync.mockResolvedValue({ value: null, stale: false });
  });

  it("builds versioned cache keys and deterministic source signatures", () => {
    expect(buildFleetGroupingArtifactKey({ selectedPilotIds: [7, 2, 7, 0, -1] })).toBe(
      "eve-intel.cache.fleet.grouping.v1.2,7"
    );

    const alpha = pilot({
      characterId: 7,
      characterName: "Alpha",
      inferenceKills: [killmail(100), killmail(101)],
      inferenceLosses: [killmail(201)]
    });
    const bravo = pilot({
      characterId: 2,
      characterName: "Bravo",
      inferenceKills: [killmail(300)],
      inferenceLosses: []
    });

    const signatureA = buildFleetGroupingArtifactSourceSignature([alpha, bravo]);
    const signatureB = buildFleetGroupingArtifactSourceSignature([bravo, alpha]);
    expect(signatureA).toBe(signatureB);
    expect(signatureA.startsWith("fleet-grouping-artifact-src-v1|")).toBe(true);
  });

  it("uses the v1 namespace for load/save integration", async () => {
    const expectedKey = "eve-intel.cache.fleet.grouping.v1.2,7";
    const sourceSignature = "fleet-grouping-artifact-src-v1|selected:2,7";
    const groupPresentationByPilotId = new Map<number, GroupPresentation>([
      [
        2,
        {
          groupId: "fleet-group-v1-a",
          groupColorToken: "fleet-group-color-0",
          isGreyedSuggestion: false,
          isUngrouped: false
        }
      ],
      [
        7,
        {
          isGreyedSuggestion: false,
          isUngrouped: true
        }
      ]
    ]);

    await loadFleetGroupingArtifact({ selectedPilotIds: [7, 2] });
    expect(mocked.getCachedStateAsync).toHaveBeenCalledWith(expectedKey);

    await saveFleetGroupingArtifact({
      selectedPilotIds: [7, 2],
      sourceSignature,
      orderedPilotIds: [7, 2],
      groupPresentationByPilotId
    });

    expect(mocked.setCachedAsync).toHaveBeenCalledWith(
      expectedKey,
      expect.objectContaining({
        version: 1,
        selectedPilotIds: [2, 7],
        sourceSignature,
        orderedPilotIds: [7, 2],
        presentationEntries: [
          [
            2,
            {
              groupId: "fleet-group-v1-a",
              groupColorToken: "fleet-group-color-0",
              isGreyedSuggestion: false,
              isUngrouped: false
            }
          ],
          [
            7,
            {
              isGreyedSuggestion: false,
              isUngrouped: true
            }
          ]
        ]
      }),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("rejects cache artifacts when the source signature mismatches", () => {
    expect(
      isFleetGroupingArtifactUsable(
        {
          version: 1,
          selectedPilotIds: [2, 7],
          sourceSignature: "fleet-grouping-artifact-src-v1|selected:2,7",
          orderedPilotIds: [7, 2],
          presentationEntries: [],
          savedAt: Date.now()
        },
        {
          selectedPilotIds: [2, 7],
          sourceSignature: "fleet-grouping-artifact-src-v1|selected:2,7|kills:100"
        }
      )
    ).toBe(false);
  });
});
