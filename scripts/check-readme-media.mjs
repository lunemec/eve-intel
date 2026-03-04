import { checkReadmeMediaArtifacts } from "./lib/readme-media/check.mjs";

try {
  const result = await checkReadmeMediaArtifacts({ repoRoot: process.cwd() });
  if (result.ok) {
    console.log(`[docs:media:check] ok sourceHash=${result.expectedHash}`);
    process.exit(0);
  }

  console.error("[docs:media:check] stale or missing README media artifacts detected:");
  for (const issue of result.issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
} catch (error) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "Unknown error";
  console.error(`[docs:media:check] fatal: ${message}`);
  process.exit(1);
}