import { describe, expect, it, vi } from "vitest";
import { createPipelineLoggers } from "./hookLogging";

describe("pipeline/hookLogging", () => {
  it("returns current debug logger and console-backed error logger", () => {
    const logDebug = vi.fn();
    const ref = { current: logDebug };
    const errorSink = vi.fn();

    const loggers = createPipelineLoggers(ref, errorSink);

    loggers.logDebug("hello", { ok: true });
    expect(logDebug).toHaveBeenCalledWith("hello", { ok: true });

    const err = new Error("boom");
    loggers.logError("msg", err);
    expect(errorSink).toHaveBeenCalledWith("msg", err);
  });
});
