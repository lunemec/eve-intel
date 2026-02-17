import { describe, expect, it } from "vitest";
import { createErrorCard, createLoadingCard } from "./stateTransitions";

const ENTRY = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred" as const
};

describe("pipeline state transitions", () => {
  it("creates loading cards with empty inference arrays", () => {
    const card = createLoadingCard(ENTRY);
    expect(card.parsedEntry).toEqual(ENTRY);
    expect(card.status).toBe("loading");
    expect(card.fetchPhase).toBe("loading");
    expect(card.predictedShips).toEqual([]);
    expect(card.fitCandidates).toEqual([]);
    expect(card.kills).toEqual([]);
    expect(card.losses).toEqual([]);
  });

  it("creates error cards with error phase and message", () => {
    const card = createErrorCard(ENTRY, "boom");
    expect(card.status).toBe("error");
    expect(card.fetchPhase).toBe("error");
    expect(card.error).toBe("boom");
    expect(card.inferenceKills).toEqual([]);
    expect(card.inferenceLosses).toEqual([]);
  });
});
