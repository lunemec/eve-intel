import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkReadmeMediaArtifacts } from "../lib/readme-media/check.mjs";
import {
  README_MEDIA_ARTIFACTS,
  README_MEDIA_MANIFEST_BASENAME,
  README_MEDIA_OUTPUT_DIR,
  README_MEDIA_SOURCE_FILES
} from "../lib/readme-media/config.mjs";
import { computeReadmeMediaSourceHash } from "../lib/readme-media/hash.mjs";

const tempRoots = [];

async function createFixtureRepo() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "readme-media-fixture-"));
  tempRoots.push(repoRoot);

  for (const relativePath of README_MEDIA_SOURCE_FILES) {
    const absolutePath = path.join(repoRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `fixture:${relativePath}\n`, "utf8");
  }

  const outputDir = path.join(repoRoot, README_MEDIA_OUTPUT_DIR);
  await mkdir(outputDir, { recursive: true });
  for (const artifact of README_MEDIA_ARTIFACTS) {
    await writeFile(path.join(outputDir, artifact.file), "artifact\n", "utf8");
  }

  const sourceHash = await computeReadmeMediaSourceHash({
    repoRoot,
    sourceFiles: README_MEDIA_SOURCE_FILES
  });

  const manifest = {
    generatedAt: "2026-03-04T00:00:00.000Z",
    sourceHash,
    sourceFiles: README_MEDIA_SOURCE_FILES,
    outputs: README_MEDIA_ARTIFACTS.map((artifact) => ({
      id: artifact.id,
      file: artifact.file,
      width: artifact.width,
      height: artifact.height,
      frameDurationsMs: artifact.frameDurationsMs
    }))
  };

  await writeFile(
    path.join(outputDir, README_MEDIA_MANIFEST_BASENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  return { repoRoot, outputDir, manifest };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(tempRoots.splice(0, tempRoots.length).map((root) => rm(root, { recursive: true, force: true })));
});

describe("checkReadmeMediaArtifacts", () => {
  it("passes when source hash and expected outputs match", async () => {
    const fixture = await createFixtureRepo();

    const result = await checkReadmeMediaArtifacts({ repoRoot: fixture.repoRoot });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.expectedHash).toBe(fixture.manifest.sourceHash);
  });

  it("fails when source hash drifts after generation", async () => {
    const fixture = await createFixtureRepo();
    await writeFile(
      path.join(fixture.repoRoot, README_MEDIA_SOURCE_FILES[0]),
      "drifted-source\n",
      "utf8"
    );

    const result = await checkReadmeMediaArtifacts({ repoRoot: fixture.repoRoot });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("README media source hash mismatch. Run npm run docs:media:generate.");
  });
});