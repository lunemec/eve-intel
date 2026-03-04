import path from "node:path";

export const README_MEDIA_OUTPUT_DIR = path.join("docs", "media", "readme");
export const README_MEDIA_MANIFEST_BASENAME = "manifest.json";

export const README_MEDIA_ARTIFACTS = [
  {
    id: "overview-full-app",
    file: "overview-full-app.png",
    scene: "hero",
    frames: ["fleet"],
    width: 1440,
    height: 900,
    kind: "image",
    frameDurationsMs: [1200]
  },
  {
    id: "detail-pilot-ships",
    file: "detail-pilot-ships.png",
    scene: "fit-metrics",
    frames: ["roles"],
    width: 1280,
    height: 720,
    kind: "image",
    frameDurationsMs: [1200]
  },
  {
    id: "detail-fleet-summary-groups",
    file: "detail-fleet-summary-groups.png",
    scene: "fleet-summary",
    frames: ["suggested"],
    width: 1200,
    height: 300,
    kind: "image",
    frameDurationsMs: [1200]
  }
];

export const README_MEDIA_SOURCE_FILES = [
  "src/App.tsx",
  "src/lib/readmeMediaScenario.ts",
  "vite.readme-media-preview.config.ts",
  "scripts/lib/readme-media/config.mjs",
  "scripts/lib/readme-media/generate.mjs"
];
