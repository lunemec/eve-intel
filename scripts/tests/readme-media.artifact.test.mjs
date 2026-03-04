import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_FILE = path.join(process.cwd(), "src", "App.tsx");
const README_FILE = path.join(process.cwd(), "README.md");
const SCENARIO_FILE = path.join(process.cwd(), "src", "lib", "readmeMediaScenario.ts");
const MEDIA_CONFIG_FILE = path.join(process.cwd(), "scripts", "lib", "readme-media", "config.mjs");
const VITE_CONFIG_FILE = path.join(process.cwd(), "vite.readme-media-preview.config.ts");
const CI_FILE = path.join(process.cwd(), ".github", "workflows", "ci.yml");

describe("readme media automation artifacts", () => {
  it("wires npm scripts for preview/generate/check", async () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

    expect(packageJson.scripts["docs:media:preview"]).toBe("vite --config vite.readme-media-preview.config.ts");
    expect(packageJson.scripts["docs:media:generate"]).toBe("node scripts/generate-readme-media.mjs");
    expect(packageJson.scripts["docs:media:check"]).toBe("node scripts/check-readme-media.mjs");
  });

  it("serves the real app route for readme media capture", async () => {
    const viteConfig = await readFile(VITE_CONFIG_FILE, "utf8");

    expect(viteConfig).toContain("import.meta.env.PACKAGE_VERSION");
    expect(viteConfig).not.toContain("/previews/readme-media.html");
  });

  it("exposes readme media scene and frame markers on App", async () => {
    const app = await readFile(APP_FILE, "utf8");

    expect(app).toContain("data-readme-media-scene");
    expect(app).toContain("data-readme-media-frame");
    expect(app).toContain("getReadmeMediaSnapshot");
  });

  it("defines deterministic readme media scenarios", async () => {
    const scenario = await readFile(SCENARIO_FILE, "utf8");

    expect(scenario).toContain("progressive-inference");
    expect(scenario).toContain("fit-metrics");
    expect(scenario).toContain("fleet-summary");
    expect(scenario).toContain("buildReadmeMediaQuery");
  });

  it("uses static screenshot media contract", async () => {
    const readme = await readFile(README_FILE, "utf8");
    const mediaConfig = await readFile(MEDIA_CONFIG_FILE, "utf8");

    expect(readme).toContain("./docs/media/readme/overview-full-app.png");
    expect(readme).toContain("./docs/media/readme/detail-pilot-ships.png");
    expect(readme).toContain("./docs/media/readme/detail-fleet-summary-groups.png");
    expect(mediaConfig).toContain('file: "overview-full-app.png"');
    expect(mediaConfig).toContain('file: "detail-pilot-ships.png"');
    expect(mediaConfig).toContain('file: "detail-fleet-summary-groups.png"');
    expect(mediaConfig).toContain('kind: "image"');
    expect(mediaConfig).not.toContain('kind: "gif"');
  });

  it("adds CI guardrail for docs media freshness", async () => {
    const ci = await readFile(CI_FILE, "utf8");
    expect(ci).toContain("Run README media freshness check");
    expect(ci).toContain("npm run docs:media:check");
  });
});
