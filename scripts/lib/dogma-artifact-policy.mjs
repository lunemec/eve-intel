import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const DOGMA_PACK_FILE_PATTERN = /^dogma-pack\..+\.json$/;
export const DOGMA_RETENTION_POLICY_VERSION = 1;

export function buildDogmaManifest({ activeVersion, packFile, sha256, generatedAt, retention }) {
  const next = {
    activeVersion: normalizeNonEmptyString(activeVersion, "activeVersion"),
    packFile: normalizePackFile(packFile, "packFile"),
    sha256: normalizeNonEmptyString(sha256, "sha256"),
    generatedAt: normalizeNonEmptyString(generatedAt, "generatedAt")
  };

  if (retention !== undefined) {
    next.retention = normalizeRetention(retention);
  }

  return next;
}

export async function listDogmaPackFiles(directoryPath) {
  if (!existsSync(directoryPath)) {
    return [];
  }

  const files = (await readdir(directoryPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && DOGMA_PACK_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  return files;
}

export async function applyDogmaArtifactRetentionPolicy({
  runtimeDir,
  archiveDir,
  activePackFile
}) {
  const normalizedRuntimeDir = normalizeNonEmptyString(runtimeDir, "runtimeDir");
  const normalizedArchiveDir = normalizeNonEmptyString(archiveDir, "archiveDir");
  const normalizedActivePackFile = normalizePackFile(activePackFile, "activePackFile");
  const activePackPath = path.join(normalizedRuntimeDir, normalizedActivePackFile);

  if (!existsSync(activePackPath)) {
    throw new Error(`Cannot enforce retention: active pack missing at ${activePackPath}.`);
  }

  const runtimePackFiles = await listDogmaPackFiles(normalizedRuntimeDir);
  const stalePackFiles = runtimePackFiles.filter((file) => file !== normalizedActivePackFile);
  const archivedEntries = [];

  if (stalePackFiles.length > 0) {
    await mkdir(normalizedArchiveDir, { recursive: true });
  }

  for (const packFile of stalePackFiles) {
    const sourcePath = path.join(normalizedRuntimeDir, packFile);
    const destinationPath = path.join(normalizedArchiveDir, packFile);
    const sourceHash = await sha256File(sourcePath);

    if (existsSync(destinationPath)) {
      const destinationHash = await sha256File(destinationPath);
      if (destinationHash !== sourceHash) {
        throw new Error(
          `Retention archive hash mismatch for ${packFile}: refusing to replace existing archive file.`
        );
      }
    } else {
      await copyFile(sourcePath, destinationPath);
      const copiedHash = await sha256File(destinationPath);
      if (copiedHash !== sourceHash) {
        throw new Error(`Retention archive verification failed for ${packFile}.`);
      }
    }

    await unlink(sourcePath);
    archivedEntries.push({ packFile, sha256: sourceHash });
  }

  return {
    activePackFile: normalizedActivePackFile,
    runtimePackFiles: await listDogmaPackFiles(normalizedRuntimeDir),
    archivedPackFiles: archivedEntries.map((entry) => entry.packFile),
    archivedEntries,
    archivePackFiles: await listDogmaPackFiles(normalizedArchiveDir)
  };
}

export async function writeDogmaRetentionIndex({
  indexPath,
  activeVersion,
  activePackFile,
  activeSha256,
  generatedAt,
  runtimeDir,
  archiveDir,
  archivedEntries = []
}) {
  const normalizedIndexPath = normalizeNonEmptyString(indexPath, "indexPath");
  const normalizedActiveVersion = normalizeNonEmptyString(activeVersion, "activeVersion");
  const normalizedActivePackFile = normalizePackFile(activePackFile, "activePackFile");
  const normalizedActiveSha256 = normalizeNonEmptyString(activeSha256, "activeSha256");
  const normalizedGeneratedAt = normalizeNonEmptyString(generatedAt, "generatedAt");
  const normalizedRuntimeDir = normalizeOptionalString(runtimeDir);
  const normalizedArchiveDir = normalizeOptionalString(archiveDir);
  const previous = await loadJson(normalizedIndexPath, {});
  const existingEntries = Array.isArray(previous?.entries) ? previous.entries : [];
  const entriesByPackFile = new Map();

  for (const entry of existingEntries) {
    const packFile = normalizeOptionalPackFile(entry?.packFile);
    if (!packFile) {
      continue;
    }
    entriesByPackFile.set(packFile, {
      packFile,
      version: normalizeOptionalString(entry.version) ?? deriveVersionFromPackFile(packFile),
      sha256: normalizeOptionalString(entry.sha256),
      location: normalizeLocation(entry.location),
      lastSeenAt: normalizeOptionalString(entry.lastSeenAt),
      archivedAt: normalizeOptionalString(entry.archivedAt)
    });
  }

  const normalizedArchivedEntries = Array.isArray(archivedEntries) ? archivedEntries : [];
  for (const entry of normalizedArchivedEntries) {
    const packFile = normalizeOptionalPackFile(entry?.packFile);
    if (!packFile) {
      continue;
    }
    const existing = entriesByPackFile.get(packFile);
    entriesByPackFile.set(packFile, {
      packFile,
      version: deriveVersionFromPackFile(packFile),
      sha256: normalizeOptionalString(entry?.sha256) ?? existing?.sha256 ?? null,
      location: "archive",
      lastSeenAt: normalizedGeneratedAt,
      archivedAt: normalizedGeneratedAt
    });
  }

  entriesByPackFile.set(normalizedActivePackFile, {
    packFile: normalizedActivePackFile,
    version: normalizedActiveVersion,
    sha256: normalizedActiveSha256,
    location: "runtime",
    lastSeenAt: normalizedGeneratedAt,
    archivedAt: null
  });

  if (normalizedArchiveDir) {
    const archivedPackFiles = await listDogmaPackFiles(normalizedArchiveDir);
    for (const packFile of archivedPackFiles) {
      const existing = entriesByPackFile.get(packFile);
      entriesByPackFile.set(packFile, {
        packFile,
        version: deriveVersionFromPackFile(packFile),
        sha256: existing?.sha256 ?? null,
        location: "archive",
        lastSeenAt: normalizedGeneratedAt,
        archivedAt: existing?.archivedAt ?? normalizedGeneratedAt
      });
    }
  }

  const index = {
    policyVersion: DOGMA_RETENTION_POLICY_VERSION,
    updatedAt: normalizedGeneratedAt,
    activeVersion: normalizedActiveVersion,
    activePackFile: normalizedActivePackFile,
    ...(normalizedRuntimeDir ? { runtimeDir: normalizedRuntimeDir } : {}),
    ...(normalizedArchiveDir ? { archiveDir: normalizedArchiveDir } : {}),
    entries: [...entriesByPackFile.values()]
      .sort((left, right) => left.packFile.localeCompare(right.packFile))
      .map((entry) => ({
        packFile: entry.packFile,
        version: entry.version ?? deriveVersionFromPackFile(entry.packFile),
        ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
        location: entry.location,
        ...(entry.lastSeenAt ? { lastSeenAt: entry.lastSeenAt } : {}),
        ...(entry.archivedAt ? { archivedAt: entry.archivedAt } : {})
      }))
  };

  await mkdir(path.dirname(normalizedIndexPath), { recursive: true });
  await writeFile(normalizedIndexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}

async function loadJson(filePath, fallback = null) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  const text = await readFile(filePath, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function deriveVersionFromPackFile(packFile) {
  return packFile.replace(/^dogma-pack\./, "").replace(/\.json$/, "");
}

function normalizeRetention(retention) {
  if (!retention || typeof retention !== "object") {
    throw new TypeError("retention must be an object when provided.");
  }

  const policyVersion = normalizeNonNegativeInteger(retention.policyVersion, "retention.policyVersion");
  const runtimePackCount = normalizeNonNegativeInteger(
    retention.runtimePackCount,
    "retention.runtimePackCount"
  );
  const archivedPackCount = normalizeNonNegativeInteger(
    retention.archivedPackCount,
    "retention.archivedPackCount"
  );
  const archiveIndexFile = normalizeNonEmptyString(retention.archiveIndexFile, "retention.archiveIndexFile");
  const archiveDir = normalizeOptionalString(retention.archiveDir);

  return {
    policyVersion,
    runtimePackCount,
    archivedPackCount,
    archiveIndexFile,
    ...(archiveDir ? { archiveDir } : {})
  };
}

async function sha256File(filePath) {
  const text = await readFile(filePath, "utf8");
  return createHash("sha256").update(text).digest("hex");
}

function normalizeNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function normalizePackFile(value, name) {
  const normalized = normalizeNonEmptyString(value, name);
  if (!DOGMA_PACK_FILE_PATTERN.test(normalized)) {
    throw new TypeError(`${name} must match dogma-pack.<version>.json.`);
  }
  return normalized;
}

function normalizeOptionalPackFile(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized || !DOGMA_PACK_FILE_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeLocation(value) {
  return value === "archive" ? "archive" : "runtime";
}
