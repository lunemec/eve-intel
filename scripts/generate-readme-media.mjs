import { generateReadmeMediaArtifacts } from "./lib/readme-media/generate.mjs";

try {
  const result = await generateReadmeMediaArtifacts({ repoRoot: process.cwd() });
  console.log(`[docs:media:generate] mode=${result.generationMode} sourceHash=${result.sourceHash}`);
  process.exit(0);
} catch (error) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "Unknown error";
  console.error(`[docs:media:generate] fatal: ${message}`);
  process.exit(1);
}