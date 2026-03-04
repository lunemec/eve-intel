import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import {
  README_MEDIA_ARTIFACTS,
  README_MEDIA_MANIFEST_BASENAME,
  README_MEDIA_OUTPUT_DIR,
  README_MEDIA_SOURCE_FILES
} from "./config.mjs";
import { computeReadmeMediaSourceHash } from "./hash.mjs";
import { readJsonFile } from "./io.mjs";

function hasString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export async function checkReadmeMediaArtifacts({ repoRoot = process.cwd() } = {}) {
  const outputDir = path.join(repoRoot, README_MEDIA_OUTPUT_DIR);
  const manifestPath = path.join(outputDir, README_MEDIA_MANIFEST_BASENAME);
  const issues = [];

  let manifest = null;
  try {
    manifest = await readJsonFile(manifestPath);
  } catch {
    issues.push(`Missing or invalid manifest: ${path.relative(repoRoot, manifestPath).replace(/\\/g, "/")}`);
    return { ok: false, issues, expectedHash: null, actualHash: null };
  }

  if (!Array.isArray(manifest?.sourceFiles) || manifest.sourceFiles.length === 0) {
    issues.push("Manifest sourceFiles must be a non-empty array.");
  }
  const sourceFiles = Array.isArray(manifest?.sourceFiles) && manifest.sourceFiles.length > 0
    ? manifest.sourceFiles
    : README_MEDIA_SOURCE_FILES;

  if (!arraysEqual(sourceFiles, README_MEDIA_SOURCE_FILES)) {
    issues.push("Manifest sourceFiles contract mismatch. Run npm run docs:media:generate.");
  }

  const expectedHash = await computeReadmeMediaSourceHash({
    repoRoot,
    sourceFiles: README_MEDIA_SOURCE_FILES
  });
  const actualHash = hasString(manifest?.sourceHash) ? manifest.sourceHash : "";

  if (actualHash !== expectedHash) {
    issues.push("README media source hash mismatch. Run npm run docs:media:generate.");
  }

  const expectedById = new Map(README_MEDIA_ARTIFACTS.map((entry) => [entry.id, entry]));
  const manifestOutputs = Array.isArray(manifest?.outputs) ? manifest.outputs : [];
  for (const expected of README_MEDIA_ARTIFACTS) {
    const manifestEntry = manifestOutputs.find((entry) => entry?.id === expected.id);
    if (!manifestEntry) {
      issues.push(`Missing manifest output entry: ${expected.id}`);
      continue;
    }

    if (manifestEntry.file !== expected.file) {
      issues.push(`Manifest output file mismatch for ${expected.id}.`);
    }
    if (manifestEntry.width !== expected.width || manifestEntry.height !== expected.height) {
      issues.push(`Manifest dimensions mismatch for ${expected.id}.`);
    }

    const outputPath = path.join(outputDir, expected.file);
    try {
      await access(outputPath, fsConstants.F_OK);
    } catch {
      issues.push(`Missing output artifact: ${path.relative(repoRoot, outputPath).replace(/\\/g, "/")}`);
    }
  }

  for (const output of manifestOutputs) {
    if (!hasString(output?.id) || !expectedById.has(output.id)) {
      issues.push(`Unknown manifest output id: ${String(output?.id ?? "")}`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    expectedHash,
    actualHash
  };
}
