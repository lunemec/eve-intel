import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop window sizing contract", () => {
  it("keeps the widened desktop startup width while preserving narrow min-width support", () => {
    const mainProcessSource = readFileSync(resolve(process.cwd(), "electron", "main.cjs"), "utf8");
    expect(mainProcessSource).toContain("width: 1140");
    expect(mainProcessSource).toContain("minWidth: 500");
  });
});
