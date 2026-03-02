import { checkDogmaArtifactConsistency } from "./lib/dogma-artifact-consistency.mjs";

async function main() {
  const result = await checkDogmaArtifactConsistency({ repoRoot: process.cwd() });
  if (!result.ok) {
    for (const message of result.errors) {
      console.error(`[check:artifact-consistency] ${message}`);
    }
    return 1;
  }

  console.log(
    `[check:artifact-consistency] ok active=${result.summary.activePackFile} runtimePacks=${result.summary.runtimePackFiles.length} archivePacks=${result.summary.archivePackFiles.length}`
  );
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error("[check:artifact-consistency] fatal", error);
    process.exit(1);
  });
