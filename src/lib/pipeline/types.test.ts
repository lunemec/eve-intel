import { describe, expect, it } from "vitest";
import type {
  CancelCheck,
  DebugLoggerRef,
  DebugLogger,
  ErrorLogger,
  PipelineSignal,
  ProcessPilotFn,
  PilotCardUpdater,
  RetryBuilder,
  RetryInfo
} from "./types";

describe("pipeline/types", () => {
  it("exposes stable retry callback shapes", () => {
    const info: RetryInfo = { status: 429, attempt: 2, delayMs: 500 };
    const builder: RetryBuilder = (_scope) => (_info) => undefined;
    expect(info.status).toBe(429);
    expect(typeof builder("ESI IDs")).toBe("function");
  });

  it("exposes stable logger callback shapes", () => {
    const debug: DebugLogger = (_message, _data) => undefined;
    const error: ErrorLogger = (_message, _error) => undefined;
    expect(typeof debug).toBe("function");
    expect(typeof error).toBe("function");
  });

  it("exposes stable cancellation check shape", () => {
    const isCancelled: CancelCheck = () => false;
    expect(isCancelled()).toBe(false);
  });

  it("exposes stable pilot-card updater shape", () => {
    const updatePilotCard: PilotCardUpdater = (_pilotName, _patch) => undefined;
    expect(typeof updatePilotCard).toBe("function");
  });

  it("exposes stable pipeline signal shape", () => {
    const signal: PipelineSignal = undefined;
    expect(signal).toBeUndefined();
  });

  it("exposes stable debug logger ref shape", () => {
    const ref: DebugLoggerRef = { current: (_message, _data) => undefined };
    expect(typeof ref.current).toBe("function");
  });

  it("exposes stable process-pilot callback shape", () => {
    const processPilot: ProcessPilotFn = async (_entry, _characterId, _onRetry) => undefined;
    expect(typeof processPilot).toBe("function");
  });
});
