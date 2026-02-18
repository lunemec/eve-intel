import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseDogmaNewFitScopeIdFlags,
  resolveDogmaNewFitScope
} from "../lib/dogma-parity-new-fits/scope.mjs";

describe("dogma new-fit scope", () => {
  it("parses and normalizes repeated/comma-delimited fit-id flags deterministically", () => {
    const fitIds = parseDogmaNewFitScopeIdFlags([
      "fit-c, fit-a",
      "fit-b",
      "fit-a",
      "  ",
      "fit-c"
    ]);

    expect(fitIds).toEqual(["fit-a", "fit-b", "fit-c"]);
  });

  it("loads scope file and merges explicit fit-id flags with deterministic dedupe/sort", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-new-fit-scope-"));
    const scopeFilePath = path.join(tempDir, "scope.json");
    await writeFile(
      scopeFilePath,
      `${JSON.stringify(
        {
          runId: "run-123",
          generatedAt: "2026-02-18T12:30:00.000Z",
          source: "fetch-cli",
          newFitIds: ["fit-3", "fit-1", "fit-1"]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const scope = await resolveDogmaNewFitScope({
      scopeFilePath,
      fitIdFlags: ["fit-2,fit-1"]
    });

    expect(scope).toEqual({
      runId: "run-123",
      generatedAt: "2026-02-18T12:30:00.000Z",
      source: "scope-file+manual-flags",
      newFitIds: ["fit-1", "fit-2", "fit-3"]
    });
  });

  it("creates manual-flags scope when only explicit fit ids are provided", async () => {
    const scope = await resolveDogmaNewFitScope({
      fitIdFlags: ["fit-b", "fit-a"],
      generatedAt: "2026-02-18T12:45:00.000Z"
    });

    expect(scope.generatedAt).toBe("2026-02-18T12:45:00.000Z");
    expect(scope.source).toBe("manual-flags");
    expect(scope.runId).toMatch(/^manual-flags-[a-f0-9]{12}$/);
    expect(scope.newFitIds).toEqual(["fit-a", "fit-b"]);
  });

  it("rejects invalid scope file shape", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-new-fit-scope-"));
    const scopeFilePath = path.join(tempDir, "invalid-scope.json");
    await writeFile(
      scopeFilePath,
      `${JSON.stringify(
        {
          runId: "run-invalid",
          generatedAt: "2026-02-18T12:45:00.000Z",
          source: "fetch-cli",
          newFitIds: "fit-1"
        }
      )}\n`,
      "utf8"
    );

    await expect(
      resolveDogmaNewFitScope({
        scopeFilePath
      })
    ).rejects.toThrowError(/newFitIds/);
  });
});
