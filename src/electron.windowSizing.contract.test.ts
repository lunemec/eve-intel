import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop window sizing contract", () => {
  it("allows narrowing close to character-profile width by reducing BrowserWindow minWidth", () => {
    const mainProcessSource = readFileSync(resolve(process.cwd(), "electron", "main.cjs"), "utf8");
    expect(mainProcessSource).toContain("minWidth: 500");
  });
});
