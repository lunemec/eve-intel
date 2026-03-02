import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DOGMA_PACK_FILE_PATTERN,
  DOGMA_RETENTION_POLICY_VERSION,
  listDogmaPackFiles
} from "./dogma-artifact-policy.mjs";

const DEFAULT_RUNTIME_DIR = path.join("public", "data");
const DEFAULT_MANIFEST_FILE = "dogma-manifest.json";
const DEFAULT_RETENTION_INDEX_PATH = path.join("data", "sde", "artifacts", "dogma-pack-retention.json");
const DEFAULT_ARCHIVE_DIR = path.join("data", "sde", "artifacts", "dogma-packs");

export async function checkDogmaArtifactConsistency({
  repoRoot = process.cwd(),
  runtimeDir = DEFAULT_RUNTIME_DIR,
  manifestPath,
  retentionIndexPath
} = {}) {
  const normalizedRepoRoot = path.resolve(String(repoRoot));
  const resolvedRuntimeDir = path.resolve(normalizedRepoRoot, String(runtimeDir));
  const resolvedManifestPath = manifestPath
    ? path.resolve(normalizedRepoRoot, String(manifestPath))
    : path.join(resolvedRuntimeDir, DEFAULT_MANIFEST_FILE);
  const errors = [];
  const runtimePackFiles = await listDogmaPackFiles(resolvedRuntimeDir);
  const manifest = await loadJsonWithErrors({
    filePath: resolvedManifestPath,
    label: "dogma manifest",
    errors,
    repoRoot: normalizedRepoRoot
  });

  const activeVersion = normalizeNonEmptyString(manifest?.activeVersion);
  const activePackFile = normalizeNonEmptyString(manifest?.packFile);
  const manifestSha256 = normalizeNonEmptyString(manifest?.sha256);

  if (!activeVersion) {
    errors.push("dogma manifest activeVersion must be a non-empty string.");
  }
  if (!activePackFile) {
    errors.push("dogma manifest packFile must be a non-empty string.");
  } else if (!DOGMA_PACK_FILE_PATTERN.test(activePackFile)) {
    errors.push("dogma manifest packFile must match dogma-pack.<version>.json.");
  }
  if (!manifestSha256) {
    errors.push("dogma manifest sha256 must be a non-empty string.");
  }

  if (runtimePackFiles.length !== 1) {
    errors.push(
      `runtime dogma pack boundary violated: expected exactly one pack in ${toRepoPath(
        normalizedRepoRoot,
        resolvedRuntimeDir
      )}, found ${runtimePackFiles.length}.`
    );
  }
  if (activePackFile) {
    if (!runtimePackFiles.includes(activePackFile)) {
      errors.push(
        `active manifest pack ${activePackFile} missing from runtime pack set (${runtimePackFiles.join(", ") || "none"}).`
      );
    }

    const activePackPath = path.join(resolvedRuntimeDir, activePackFile);
    if (!existsSync(activePackPath)) {
      errors.push(`active pack file missing at ${toRepoPath(normalizedRepoRoot, activePackPath)}.`);
    } else if (manifestSha256) {
      const runtimeSha256 = await sha256File(activePackPath);
      if (runtimeSha256 !== manifestSha256) {
        errors.push(
          `manifest sha256 mismatch for ${activePackFile}: manifest=${manifestSha256} runtime=${runtimeSha256}.`
        );
      }
    }

    const derivedVersion = deriveVersionFromPackFile(activePackFile);
    if (activeVersion && derivedVersion !== activeVersion) {
      errors.push(
        `manifest activeVersion mismatch: activeVersion=${activeVersion} derivedFromPack=${derivedVersion}.`
      );
    }
  }

  const retention = isObjectRecord(manifest?.retention) ? manifest.retention : null;
  if (!retention) {
    errors.push("dogma manifest retention metadata is required for artifact consistency checks.");
  }

  const retentionPolicyVersion = Number(retention?.policyVersion);
  const retentionRuntimePackCount = Number(retention?.runtimePackCount);
  const retentionArchivedPackCount = Number(retention?.archivedPackCount);
  const retentionArchiveIndexFile = normalizeNonEmptyString(retention?.archiveIndexFile);
  const retentionArchiveDir = normalizeNonEmptyString(retention?.archiveDir);

  if (!Number.isInteger(retentionPolicyVersion)) {
    errors.push("dogma manifest retention.policyVersion must be a non-negative integer.");
  } else if (retentionPolicyVersion !== DOGMA_RETENTION_POLICY_VERSION) {
    errors.push(
      `dogma manifest retention.policyVersion mismatch: expected=${DOGMA_RETENTION_POLICY_VERSION} actual=${retentionPolicyVersion}.`
    );
  }

  if (!Number.isInteger(retentionRuntimePackCount) || retentionRuntimePackCount < 0) {
    errors.push("dogma manifest retention.runtimePackCount must be a non-negative integer.");
  } else if (retentionRuntimePackCount !== runtimePackFiles.length) {
    errors.push(
      `dogma manifest retention.runtimePackCount mismatch: manifest=${retentionRuntimePackCount} runtime=${runtimePackFiles.length}.`
    );
  }

  if (!Number.isInteger(retentionArchivedPackCount) || retentionArchivedPackCount < 0) {
    errors.push("dogma manifest retention.archivedPackCount must be a non-negative integer.");
  }

  if (!retentionArchiveIndexFile) {
    errors.push("dogma manifest retention.archiveIndexFile must be a non-empty string.");
  }

  const resolvedRetentionIndexPath = path.resolve(
    normalizedRepoRoot,
    retentionIndexPath
      ? String(retentionIndexPath)
      : retentionArchiveIndexFile ?? DEFAULT_RETENTION_INDEX_PATH
  );

  const retentionIndex = await loadJsonWithErrors({
    filePath: resolvedRetentionIndexPath,
    label: "dogma retention index",
    errors,
    repoRoot: normalizedRepoRoot
  });

  const archiveDirFromIndex = normalizeNonEmptyString(retentionIndex?.archiveDir);
  const resolvedArchiveDir = path.resolve(
    normalizedRepoRoot,
    retentionArchiveDir ?? archiveDirFromIndex ?? DEFAULT_ARCHIVE_DIR
  );
  const archivePackFiles = await listDogmaPackFiles(resolvedArchiveDir);

  const retentionEntries = Array.isArray(retentionIndex?.entries) ? retentionIndex.entries : null;
  const runtimeEntries = [];
  const archiveEntries = [];

  if (!retentionEntries) {
    errors.push("dogma retention index entries must be an array.");
  } else {
    const entryPackFiles = [];
    const seenPackFiles = new Set();

    for (let index = 0; index < retentionEntries.length; index += 1) {
      const entry = retentionEntries[index];
      const packFile = normalizeNonEmptyString(entry?.packFile);
      const location = normalizeNonEmptyString(entry?.location);

      if (!packFile) {
        errors.push(`dogma retention index entry ${index} packFile must be a non-empty string.`);
        continue;
      }
      if (!DOGMA_PACK_FILE_PATTERN.test(packFile)) {
        errors.push(
          `dogma retention index entry ${index} packFile must match dogma-pack.<version>.json.`
        );
      }
      if (seenPackFiles.has(packFile)) {
        errors.push(`dogma retention index contains duplicate entry for ${packFile}.`);
      }
      seenPackFiles.add(packFile);
      entryPackFiles.push(packFile);

      if (location === "runtime") {
        runtimeEntries.push(entry);
      } else if (location === "archive") {
        archiveEntries.push(entry);
      } else {
        errors.push(`dogma retention index entry ${packFile} has invalid location ${location ?? "<empty>"}.`);
      }
    }

    const sortedPackFiles = [...entryPackFiles].sort((left, right) => left.localeCompare(right));
    if (!arraysEqual(entryPackFiles, sortedPackFiles)) {
      errors.push("dogma retention index entries must be sorted by packFile for deterministic output.");
    }
  }

  const retentionIndexPolicyVersion = Number(retentionIndex?.policyVersion);
  if (!Number.isInteger(retentionIndexPolicyVersion)) {
    errors.push("dogma retention index policyVersion must be a non-negative integer.");
  } else if (retentionIndexPolicyVersion !== DOGMA_RETENTION_POLICY_VERSION) {
    errors.push(
      `dogma retention index policyVersion mismatch: expected=${DOGMA_RETENTION_POLICY_VERSION} actual=${retentionIndexPolicyVersion}.`
    );
  }

  if (activeVersion && normalizeNonEmptyString(retentionIndex?.activeVersion) !== activeVersion) {
    errors.push(
      `dogma retention index activeVersion mismatch: manifest=${activeVersion} index=${normalizeNonEmptyString(
        retentionIndex?.activeVersion
      )}.`
    );
  }
  if (activePackFile && normalizeNonEmptyString(retentionIndex?.activePackFile) !== activePackFile) {
    errors.push(
      `dogma retention index activePackFile mismatch: manifest=${activePackFile} index=${normalizeNonEmptyString(
        retentionIndex?.activePackFile
      )}.`
    );
  }

  if (runtimeEntries.length !== 1) {
    errors.push(`dogma retention index must contain exactly one runtime entry, found ${runtimeEntries.length}.`);
  }

  const runtimeEntry = runtimeEntries[0];
  if (runtimeEntry && activePackFile && runtimeEntry.packFile !== activePackFile) {
    errors.push(
      `dogma retention index runtime entry mismatch: expected=${activePackFile} actual=${runtimeEntry.packFile}.`
    );
  }
  if (runtimeEntry) {
    const runtimeEntrySha256 = normalizeNonEmptyString(runtimeEntry.sha256);
    if (!runtimeEntrySha256) {
      errors.push("dogma retention index runtime entry sha256 must be a non-empty string.");
    } else if (manifestSha256 && runtimeEntrySha256 !== manifestSha256) {
      errors.push(
        `dogma retention index runtime entry sha256 mismatch: manifest=${manifestSha256} index=${runtimeEntrySha256}.`
      );
    }
  }

  if (Number.isInteger(retentionArchivedPackCount) && retentionArchivedPackCount >= 0) {
    if (retentionArchivedPackCount !== archiveEntries.length) {
      errors.push(
        `dogma manifest retention.archivedPackCount mismatch: manifest=${retentionArchivedPackCount} index=${archiveEntries.length}.`
      );
    }
  }

  const archiveEntryPackFiles = archiveEntries
    .map((entry) => normalizeNonEmptyString(entry?.packFile))
    .filter((packFile) => Boolean(packFile))
    .sort((left, right) => left.localeCompare(right));
  if (!arraysEqual(archiveEntryPackFiles, archivePackFiles)) {
    errors.push(
      `archive pack mismatch between retention index and filesystem: index=${archiveEntryPackFiles.join(", ") || "none"} filesystem=${archivePackFiles.join(", ") || "none"}.`
    );
  }

  for (const entry of archiveEntries) {
    const packFile = normalizeNonEmptyString(entry?.packFile);
    if (!packFile) {
      continue;
    }
    const archivePath = path.join(resolvedArchiveDir, packFile);
    if (!existsSync(archivePath)) {
      errors.push(`archive pack missing at ${toRepoPath(normalizedRepoRoot, archivePath)}.`);
      continue;
    }
    const entrySha256 = normalizeNonEmptyString(entry?.sha256);
    if (!entrySha256) {
      errors.push(`dogma retention index archive entry ${packFile} sha256 must be a non-empty string.`);
      continue;
    }
    const archiveSha256 = await sha256File(archivePath);
    if (archiveSha256 !== entrySha256) {
      errors.push(`dogma retention index archive sha256 mismatch for ${packFile}.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      activeVersion: activeVersion ?? null,
      activePackFile: activePackFile ?? null,
      runtimePackFiles,
      archivePackFiles
    }
  };
}

async function loadJsonWithErrors({ filePath, label, errors, repoRoot }) {
  if (!existsSync(filePath)) {
    errors.push(`missing ${label} at ${toRepoPath(repoRoot, filePath)}.`);
    return null;
  }

  let text = "";
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    errors.push(
      `unable to read ${label} at ${toRepoPath(repoRoot, filePath)}: ${formatErrorMessage(error)}.`
    );
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(
      `invalid JSON in ${label} at ${toRepoPath(repoRoot, filePath)}: ${formatErrorMessage(error)}.`
    );
    return null;
  }
}

async function sha256File(filePath) {
  const text = await readFile(filePath, "utf8");
  return createHash("sha256").update(text).digest("hex");
}

function deriveVersionFromPackFile(packFile) {
  return packFile.replace(/^dogma-pack\./, "").replace(/\.json$/, "");
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => entry === right[index]);
}

function formatErrorMessage(error) {
  if (!error || typeof error !== "object") {
    return "Unknown error";
  }
  return typeof error.message === "string" && error.message.trim().length > 0
    ? error.message
    : "Unknown error";
}

function toRepoPath(repoRoot, targetPath) {
  const relative = path.relative(repoRoot, targetPath);
  if (!relative || relative === ".") {
    return ".";
  }
  return relative.split(path.sep).join("/");
}
