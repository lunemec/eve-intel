import { describe, expect, it, vi } from "vitest";
import { cancelAllPilotRuns, requestPilotRun, type ActivePilotRun } from "./runLifecycle";
import type { ParsedPilotInput } from "../../types";

const ENTRY: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A",
  parseConfidence: 1,
  shipSource: "inferred"
};

const ENTRY_EXPLICIT: ParsedPilotInput = {
  pilotName: "Pilot A",
  sourceLine: "Pilot A (Eris)",
  explicitShip: "Eris",
  parseConfidence: 1,
  shipSource: "explicit"
};

describe("runLifecycle", () => {
  it("queues a follow-up run when requested while active and starts it after settle", async () => {
    const activeByPilotKey = new Map<string, ActivePilotRun>();
    const pendingByPilotKey = new Map<string, { entry: ParsedPilotInput; mode: "interactive" | "background" }>();
    const resolveRuns: Array<() => void> = [];
    const launchRun = vi.fn(async (_params: {
      entry: ParsedPilotInput;
      mode: "interactive" | "background";
      abortController: AbortController;
      isCancelled: () => boolean;
    }) => new Promise<void>((resolve) => {
      resolveRuns.push(resolve);
    }));

    requestPilotRun({
      entry: ENTRY,
      mode: "interactive",
      queueIfActive: false,
      activeByPilotKey,
      pendingByPilotKey,
      launchRun
    });
    expect(activeByPilotKey.size).toBe(1);

    requestPilotRun({
      entry: ENTRY_EXPLICIT,
      mode: "interactive",
      queueIfActive: true,
      activeByPilotKey,
      pendingByPilotKey,
      launchRun
    });

    expect(launchRun).toHaveBeenCalledTimes(1);
    expect(pendingByPilotKey.size).toBe(1);
    expect(resolveRuns).toHaveLength(1);
    resolveRuns[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(launchRun).toHaveBeenCalledTimes(2);
    expect(launchRun).toHaveBeenNthCalledWith(2, expect.objectContaining({ entry: ENTRY_EXPLICIT }));
    cancelAllPilotRuns({ activeByPilotKey, pendingByPilotKey });
  });
});
