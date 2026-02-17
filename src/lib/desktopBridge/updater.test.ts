import { describe, expect, it } from "vitest";
import { buildUpdaterLogSignature, formatUpdaterLogEntry } from "./updater";

describe("desktopBridge/updater", () => {
  it("builds deterministic signatures for dedupe", () => {
    const state: DesktopUpdaterState = {
      status: "downloading",
      progress: 45,
      version: "1.0.0",
      availableVersion: "1.1.0",
      downloadedVersion: null,
      error: null,
      errorDetails: null
    };

    expect(buildUpdaterLogSignature(state)).toBe("downloading|45|1.1.0|null|null|");
  });

  it("formats updater log payloads for error and update states", () => {
    const errorState: DesktopUpdaterState = {
      status: "error",
      progress: 0,
      version: "1.0.0",
      availableVersion: null,
      downloadedVersion: null,
      error: "failed",
      errorDetails: "network"
    };
    expect(formatUpdaterLogEntry(errorState)).toEqual({
      message: "Updater error",
      data: { message: "failed", details: "network" }
    });

    const checkingState: DesktopUpdaterState = {
      status: "checking",
      progress: 0,
      version: "1.0.0",
      availableVersion: null,
      downloadedVersion: null,
      error: null,
      errorDetails: null
    };
    expect(formatUpdaterLogEntry(checkingState)).toEqual({
      message: "Updater state",
      data: {
        status: "checking",
        progress: 0,
        availableVersion: null,
        downloadedVersion: null
      }
    });
  });
});
