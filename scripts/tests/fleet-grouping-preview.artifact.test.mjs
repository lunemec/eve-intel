import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PREVIEW_FILE = path.join(process.cwd(), "public", "previews", "fleet-grouping.html");
const PREVIEW_VITE_CONFIG_FILE = path.join(
  process.cwd(),
  "vite.fleet-grouping-preview.config.ts"
);

describe("fleet grouping preview artifact", () => {
  it("exposes an npm script that serves fleet grouping preview at root", async () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

    expect(packageJson.scripts["preview:fleet-grouping"]).toBe(
      "vite --config vite.fleet-grouping-preview.config.ts"
    );
  });

  it("defines a vite config that routes root requests to the preview artifact", async () => {
    const viteConfig = await readFile(PREVIEW_VITE_CONFIG_FILE, "utf8");

    expect(viteConfig).toContain("/previews/fleet-grouping.html");
    expect(viteConfig).toContain('pathname !== "/"');
    expect(viteConfig).toContain('pathname !== "/index.html"');
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
