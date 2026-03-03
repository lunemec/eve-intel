import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PREVIEW_FILE = path.join(process.cwd(), "public", "previews", "fleet-grouping.html");

describe("fleet grouping preview artifact", () => {
  it("exposes an npm script to open the static preview page", async () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

    expect(packageJson.scripts["preview:fleet-grouping"]).toBe("vite --open /previews/fleet-grouping.html");
  });

  it("includes required grouped and suggested visual scenarios", async () => {
    const html = await readFile(PREVIEW_FILE, "utf8");

    expect(html).toContain('data-preview-scenario="single-group"');
    expect(html).toContain('data-preview-scenario="multi-group"');
    expect(html).toContain('data-preview-scenario="ungrouped"');
    expect(html).toContain('data-preview-scenario="suggested-greyed"');
    expect(html).toContain('data-preview-scenario="cap-example"');
    expect(html).toContain('data-preview-scenario="narrow-width"');
  });
});
