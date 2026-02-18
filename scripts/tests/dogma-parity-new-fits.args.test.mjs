import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DogmaParityNewFitsCliUsageError,
  parseDogmaParityNewFitsArgs
} from "../lib/dogma-parity-new-fits/cli.mjs";

describe("parseDogmaParityNewFitsArgs", () => {
  it("accepts --scope-file as a valid scope source", () => {
    const parsed = parseDogmaParityNewFitsArgs(["--scope-file", "tmp/scope.json"]);

    expect(parsed.scopeFilePath).toBe("tmp/scope.json");
    expect(parsed.fitIdFlags).toEqual([]);
  });

  it("collects repeated --fit-id and --fit-ids flags for downstream scope parsing", () => {
    const parsed = parseDogmaParityNewFitsArgs([
      "--fit-id",
      "fit-1",
      "--fit-ids",
      "fit-2,fit-3",
      "--fit-id",
      "fit-4"
    ]);

    expect(parsed.scopeFilePath).toBeUndefined();
    expect(parsed.fitIdFlags).toEqual(["fit-1", "fit-2,fit-3", "fit-4"]);
  });

  it("rejects runs with no scope source flags", () => {
    expect(() => parseDogmaParityNewFitsArgs([])).toThrowError(DogmaParityNewFitsCliUsageError);
    expect(() => parseDogmaParityNewFitsArgs([])).toThrowError(/--scope-file/);
  });

  it("allows --help without requiring scope source flags", () => {
    const parsed = parseDogmaParityNewFitsArgs(["--help"]);

    expect(parsed.help).toBe(true);
    expect(parsed.scopeFilePath).toBeUndefined();
    expect(parsed.fitIdFlags).toEqual([]);
  });
});

describe("dogma parity new-fits npm wiring", () => {
  it("exposes npm script for new-fit orchestrator", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["dogma:parity:new-fits"]).toBe(
      "node scripts/run-dogma-parity-new-fits.mjs"
    );
  });
});
