import { describe, expect, it, vi } from "vitest";
import { createPilotCardUpdater, patchPilotCardRows } from "./cards";
import type { PilotCard } from "../usePilotIntelPipeline";

function makeCard(name: string): PilotCard {
  return {
    parsedEntry: {
      pilotName: name,
      sourceLine: name,
      parseConfidence: 1,
      shipSource: "inferred"
    },
    status: "loading",
    predictedShips: [],
    fitCandidates: [],
    kills: [],
    losses: [],
    inferenceKills: [],
    inferenceLosses: []
  };
}

describe("pipeline/cards", () => {
  it("patches matching pilot row case-insensitively", () => {
    const rows = [makeCard("Pilot A"), makeCard("Pilot B")];
    const next = patchPilotCardRows(rows, "pilot a", { status: "ready", fetchPhase: "enriching" });

    expect(next[0].status).toBe("ready");
    expect(next[0].fetchPhase).toBe("enriching");
    expect(next[1].status).toBe("loading");
  });

  it("applies pilot-card patch through setState when not cancelled", () => {
    const setPilotCards = vi.fn();
    const updatePilotCard = createPilotCardUpdater({
      isCancelled: () => false,
      setPilotCards
    });

    updatePilotCard("Pilot A", { status: "ready" });
    expect(setPilotCards).toHaveBeenCalledTimes(1);

    const updater = setPilotCards.mock.calls[0][0] as (rows: PilotCard[]) => PilotCard[];
    const rows = [makeCard("Pilot A"), makeCard("Pilot B")];
    const next = updater(rows);
    expect(next[0].status).toBe("ready");
    expect(next[1].status).toBe("loading");
  });

  it("does not patch pilot cards when cancelled", () => {
    const setPilotCards = vi.fn();
    const updatePilotCard = createPilotCardUpdater({
      isCancelled: () => true,
      setPilotCards
    });

    updatePilotCard("Pilot A", { status: "ready" });
    expect(setPilotCards).not.toHaveBeenCalled();
  });
});
