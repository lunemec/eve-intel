import { describe, expect, it } from "vitest";
import { FetchZkillFitsCliUsageError } from "../lib/zkill-fit-fetch-cli/args.mjs";
import { runFetchZkillFitsCli } from "../lib/zkill-fit-fetch-cli/cli.mjs";

function createLineCollector() {
  const lines = [];
  return {
    lines,
    collect(line = "") {
      lines.push(String(line));
    }
  };
}

describe("runFetchZkillFitsCli", () => {
  it("returns 2 and prints usage details when argument parsing fails", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();

    const exitCode = await runFetchZkillFitsCli(["--unknown"], {
      parseArgsFn: () => {
        throw new FetchZkillFitsCliUsageError("Unknown argument: --unknown");
      },
      formatUsageFn: () => "usage text",
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(2);
    expect(stdout.lines).toEqual([]);
    expect(stderr.lines).toEqual(["Unknown argument: --unknown", "", "usage text"]);
  });

  it("returns 0 and prints usage when help is requested", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();

    let pipelineCalled = false;
    const exitCode = await runFetchZkillFitsCli(["--help"], {
      parseArgsFn: () => ({ help: true }),
      formatUsageFn: () => "usage text",
      runPipelineFn: async () => {
        pipelineCalled = true;
        return { manifest: { output: { recordsWritten: 0, duplicatesSkipped: 0, errorsLogged: 0 } } };
      },
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(0);
    expect(pipelineCalled).toBe(false);
    expect(stdout.lines).toEqual(["usage text"]);
    expect(stderr.lines).toEqual([]);
  });

  it("runs pipeline and prints a deterministic summary line on success", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();

    const exitCode = await runFetchZkillFitsCli(["--ship-type-ids", "29984", "--output", "out.jsonl"], {
      parseArgsFn: () => ({
        help: false,
        shipTypeIds: [29984],
        outputPath: "out.jsonl",
        maxRecords: 200,
        retryPolicy: { maxAttempts: 5, baseMs: 1000, maxMs: 30000 },
        requestTimeoutMs: 15000
      }),
      runPipelineFn: async () => ({
        manifest: {
          output: {
            recordsWritten: 3,
            duplicatesSkipped: 1,
            errorsLogged: 2
          }
        }
      }),
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(0);
    expect(stdout.lines).toEqual(["[fetch-zkill-fits] records=3 duplicates=1 errors=2"]);
    expect(stderr.lines).toEqual([]);
  });

  it("returns 1 and prints fallback fatal message for unknown runtime errors", async () => {
    const stdout = createLineCollector();
    const stderr = createLineCollector();

    const exitCode = await runFetchZkillFitsCli(["--ship-type-ids", "29984", "--output", "out.jsonl"], {
      parseArgsFn: () => ({
        help: false,
        shipTypeIds: [29984],
        outputPath: "out.jsonl",
        maxRecords: 200,
        retryPolicy: { maxAttempts: 5, baseMs: 1000, maxMs: 30000 },
        requestTimeoutMs: 15000
      }),
      runPipelineFn: async () => {
        throw "fatal-string-error";
      },
      stdout: stdout.collect,
      stderr: stderr.collect
    });

    expect(exitCode).toBe(1);
    expect(stdout.lines).toEqual([]);
    expect(stderr.lines).toEqual(["[fetch-zkill-fits] fatal: Unknown error"]);
  });
});
