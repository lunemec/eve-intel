import { describe, expect, it } from "vitest";
import {
  buildReadmeMediaQuery,
  getReadmeMediaSnapshotFromSearch,
  parseReadmeMediaModeFromSearch
} from "./readmeMediaScenario";
import { TOP_SHIP_CANDIDATES } from "./pipeline/constants";

describe("parseReadmeMediaModeFromSearch", () => {
  it("returns disabled mode by default", () => {
    expect(parseReadmeMediaModeFromSearch("")).toEqual({ enabled: false });
    expect(parseReadmeMediaModeFromSearch("?readmeMedia=0")).toEqual({ enabled: false });
  });

  it("parses supported scene + frame combinations", () => {
    expect(parseReadmeMediaModeFromSearch("?readmeMedia=1&mediaScene=progressive-inference&mediaFrame=enriching")).toEqual({
      enabled: true,
      sceneId: "progressive-inference",
      frameId: "enriching"
    });
  });

  it("falls back to safe defaults for unknown scene/frame", () => {
    expect(parseReadmeMediaModeFromSearch("?readmeMedia=1&mediaScene=unknown&mediaFrame=unknown")).toEqual({
      enabled: true,
      sceneId: "hero",
      frameId: "overview"
    });
  });
});

describe("buildReadmeMediaQuery", () => {
  it("builds canonical deterministic query strings", () => {
    expect(buildReadmeMediaQuery({ sceneId: "hero", frameId: "overview" })).toBe(
      "?readmeMedia=1&mediaScene=hero&mediaFrame=overview"
    );
    expect(buildReadmeMediaQuery({ sceneId: "fit-metrics", frameId: "roles" })).toBe(
      "?readmeMedia=1&mediaScene=fit-metrics&mediaFrame=roles"
    );
  });
});

describe("getReadmeMediaSnapshotFromSearch", () => {
  it("returns null outside readme media mode", () => {
    expect(getReadmeMediaSnapshotFromSearch("")).toBeNull();
  });

  it("returns deterministic snapshot payload for media captures", () => {
    const snapshot = getReadmeMediaSnapshotFromSearch("?readmeMedia=1&mediaScene=fleet-summary&mediaFrame=suggested");

    expect(snapshot).not.toBeNull();
    expect(snapshot?.sceneId).toBe("fleet-summary");
    expect(snapshot?.frameId).toBe("suggested");
    expect(snapshot?.selectedPilotCards.length).toBeGreaterThan(0);
    expect(snapshot?.displayPilotCards.length).toBeGreaterThan(snapshot?.selectedPilotCards.length ?? 0);
    expect(snapshot?.groupPresentationByPilotId.size).toBeGreaterThan(0);

    const hasGreyedSuggestion = snapshot?.displayPilotCards.some((pilot) => {
      if (!pilot.characterId) {
        return false;
      }
      return snapshot.groupPresentationByPilotId.get(pilot.characterId)?.isGreyedSuggestion === true;
    });
    expect(hasGreyedSuggestion).toBe(true);
  });

  it("curates hero fleet frame with dual-likelihood ships, combat pills, and EFT-backed fits", () => {
    const snapshot = getReadmeMediaSnapshotFromSearch("?readmeMedia=1&mediaScene=hero&mediaFrame=fleet");

    expect(snapshot).not.toBeNull();
    expect(snapshot?.sceneId).toBe("hero");
    expect(snapshot?.frameId).toBe("fleet");

    const featuredPilot = snapshot?.displayPilotCards[0];
    expect(featuredPilot?.predictedShips.length).toBeGreaterThanOrEqual(2);

    const topTwoShips = featuredPilot?.predictedShips.slice(0, 2) ?? [];
    expect(topTwoShips.length).toBe(2);
    for (const ship of topTwoShips) {
      expect((ship.rolePills ?? []).length).toBeGreaterThanOrEqual(1);
      const matchingFit = featuredPilot?.fitCandidates.find((fit) => fit.shipTypeId === ship.shipTypeId);
      expect(matchingFit).toBeDefined();
      expect(matchingFit?.eftSections).toBeDefined();
      const hasAnyModules = matchingFit?.eftSections
        ? [
            ...matchingFit.eftSections.high,
            ...matchingFit.eftSections.mid,
            ...matchingFit.eftSections.low,
            ...matchingFit.eftSections.rig,
            ...matchingFit.eftSections.other
          ].length > 0
        : false;
      expect(hasAnyModules).toBe(true);
    }

    const allShips = snapshot?.displayPilotCards.flatMap((pilot) => pilot.predictedShips) ?? [];
    const hardCynoShipCount = allShips.filter((ship) => ship.pillEvidence?.Cyno).length;
    expect(hardCynoShipCount).toBe(1);

    const pillSet = new Set(
      allShips.flatMap((ship) => [
        ...(ship.rolePills ?? []),
        ...(ship.pillEvidence?.Cyno ? ["Cyno"] : []),
        ...(ship.pillEvidence?.Bait ? ["Bait"] : [])
      ])
    );
    for (const pill of ["Cyno", "Bait", "Long Point", "Web", "HIC", "Bubble", "Boosh", "Neut", "Cloaky", "Shield Logi", "Armor Logi"]) {
      expect(pillSet.has(pill)).toBe(true);
    }

    const displayCards = snapshot?.displayPilotCards ?? [];
    const suggestedIndex = displayCards.findIndex((pilot) => {
      if (!pilot.characterId) {
        return false;
      }
      return snapshot?.groupPresentationByPilotId.get(pilot.characterId)?.isGreyedSuggestion === true;
    });
    const firstGroupBIndex = displayCards.findIndex((pilot) => {
      if (!pilot.characterId) {
        return false;
      }
      return snapshot?.groupPresentationByPilotId.get(pilot.characterId)?.groupId === "fleet-group-v1-b";
    });
    expect(suggestedIndex).toBeGreaterThanOrEqual(0);
    expect(firstGroupBIndex).toBeGreaterThanOrEqual(0);
    expect(suggestedIndex).toBeLessThan(firstGroupBIndex);

    const groupBPilot = displayCards.find((pilot) => {
      if (!pilot.characterId) {
        return false;
      }
      return snapshot?.groupPresentationByPilotId.get(pilot.characterId)?.groupId === "fleet-group-v1-b";
    });
    expect(groupBPilot?.characterId).toBeDefined();
    const groupBPresentation = groupBPilot?.characterId
      ? snapshot?.groupPresentationByPilotId.get(groupBPilot.characterId)
      : undefined;
    expect(groupBPresentation?.groupColorToken).toBe("fleet-group-color-3");

    const soloStyleCount = displayCards.filter((pilot) => Number(pilot.stats?.soloRatio ?? 0) >= 15).length;
    const fleetStyleCount = displayCards.filter((pilot) => Number(pilot.stats?.soloRatio ?? 100) <= 5).length;
    expect(soloStyleCount).toBeGreaterThanOrEqual(1);
    expect(fleetStyleCount).toBeGreaterThanOrEqual(1);
  });

  it("aligns fit-metrics roles frame ship suggestions to runtime top-ship cap", () => {
    const snapshot = getReadmeMediaSnapshotFromSearch("?readmeMedia=1&mediaScene=fit-metrics&mediaFrame=roles");

    expect(snapshot).not.toBeNull();
    expect(snapshot?.sceneId).toBe("fit-metrics");
    expect(snapshot?.frameId).toBe("roles");

    const featuredPilot = snapshot?.displayPilotCards[0];
    expect(featuredPilot).toBeDefined();
    expect(featuredPilot?.predictedShips).toHaveLength(TOP_SHIP_CANDIDATES);

    const displayedShips = featuredPilot?.predictedShips.slice(0, 3) ?? [];
    expect(displayedShips).toHaveLength(3);
    for (const ship of displayedShips) {
      const matchingFit = featuredPilot?.fitCandidates.find((fit) => fit.shipTypeId === ship.shipTypeId);
      expect(matchingFit).toBeDefined();
    }
  });
});
