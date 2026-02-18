import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("repository artifact hygiene", () => {
  it("has no tracked __pycache__ directories or .pyc files", () => {
    const trackedFiles = execFileSync("git", ["ls-files"], {
      cwd: process.cwd(),
      encoding: "utf8"
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const forbiddenArtifacts = trackedFiles.filter(
      (path) => path.includes("__pycache__/") || path.endsWith(".pyc")
    );

    expect(forbiddenArtifacts).toEqual([]);
  });
});
