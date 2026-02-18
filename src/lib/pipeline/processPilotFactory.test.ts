import { describe, expect, it, vi } from "vitest";
import { createProcessPilot } from "./processPilotFactory";
import type { ParsedPilotInput } from "../../types";

const ENTRY: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

describe("pipeline/processPilotFactory", () => {
  it("builds processPilot callback that forwards expected args to processPilotEntry", async () => {
    const processPilotEntry = vi.fn(async () => undefined);
    const updatePilotCard = vi.fn();
    const signal = new AbortController().signal;
    const onRetry = (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined;
    const logDebug = vi.fn();
    const logError = vi.fn();

    const processPilot = createProcessPilot(
      {
        settings: { lookbackDays: 7 },
        dogmaIndex: null,
        signal,
        isCancelled: () => false,
        updatePilotCard,
        logDebug,
        logError,
        topShips: 5,
        deepHistoryMaxPages: 20
      },
      { processPilotEntry }
    );

    await processPilot(ENTRY, 101, onRetry);

    expect(processPilotEntry).toHaveBeenCalledTimes(1);
    expect(processPilotEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: ENTRY,
        characterId: 101,
        settings: { lookbackDays: 7 },
        signal,
        onRetry,
        topShips: 5,
        deepHistoryMaxPages: 20,
        updatePilotCard,
        logDebug,
        logError
      })
    );
  });

  it("returns underlying processPilotEntry promise", async () => {
    const marker = Promise.resolve();
    const processPilotEntry = vi.fn(() => marker);
    const processPilot = createProcessPilot(
      {
        settings: { lookbackDays: 7 },
        dogmaIndex: null,
        signal: undefined,
        isCancelled: () => false,
        updatePilotCard: vi.fn(),
        logDebug: vi.fn(),
        logError: vi.fn(),
        topShips: 5,
        deepHistoryMaxPages: 20
      },
      { processPilotEntry }
    );

    const result = processPilot(ENTRY, 101, (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined);
    expect(result).toBe(marker);
    await result;
  });
});
