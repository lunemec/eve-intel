import type { DebugLoggerRef, ErrorLogger } from "./types";

export function createPipelineLoggers(
  logDebugRef: DebugLoggerRef,
  errorSink: ErrorLogger = console.error
): { logDebug: DebugLoggerRef["current"]; logError: ErrorLogger } {
  return {
    logDebug: logDebugRef.current,
    logError: (message, error) => errorSink(message, error)
  };
}
