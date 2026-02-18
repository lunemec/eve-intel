import { describe, expect, it } from "vitest";
import {
  DogmaParityFollowupBaselineCliUsageError,
  runDogmaParityFollowupBaselineCli
} from "../lib/dogma-parity-followup-baseline/cli.mjs";

function createLineCollector() {
  const lines = [];
  return {
    lines,
    collect(line = "") {
      lines.push(String(line));
    }
  };
}

describe("runDogmaParityFollowupBaselineCli", () => {
  it("fails entry gate before baseline generation when precondition is unmet", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();
    const baselineCalls = [];

    const exitCode = await runDogmaParityFollowupBaselineCli([], {
      runBaselineFn: async () => {
        baselineCalls.push("called");
      },
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(2);
    expect(stdout.lines).toEqual([]);
    expect(stderr.lines).toEqual([
      "[dogma:parity:followup:baseline] entry gate failed: current Ralph task is not marked completed/merged. Re-run with --precondition-met once the prerequisite task is merged."
    ]);
    expect(baselineCalls).toEqual([]);
  });

  it("runs baseline when precondition flag is provided", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();
    const baselineCalls = [];

    const exitCode = await runDogmaParityFollowupBaselineCli(["--precondition-met"], {
      runBaselineFn: async (parsedArgs) => {
        baselineCalls.push(parsedArgs);
      },
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(0);
    expect(stderr.lines).toEqual([]);
    expect(stdout.lines).toEqual([
      "[dogma:parity:followup:baseline] baseline run complete."
    ]);
    expect(baselineCalls).toEqual([
      {
        help: false,
        preconditionMet: true
      }
    ]);
  });

  it("returns usage error output for invalid arguments", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();

    const exitCode = await runDogmaParityFollowupBaselineCli(["--unknown"], {
      parseArgsFn: () => {
        throw new DogmaParityFollowupBaselineCliUsageError("Unknown argument: --unknown");
      },
      formatUsageFn: () => "usage text",
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(2);
    expect(stdout.lines).toEqual([]);
    expect(stderr.lines).toEqual(["Unknown argument: --unknown", "", "usage text"]);
  });
});
