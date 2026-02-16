import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sdeRoot = path.join(repoRoot, "data", "sde");
const manifestPath = path.join(sdeRoot, ".manifest.json");
const sourceBase = "https://www.fuzzwork.co.uk/dump/latest";
const requiredFiles = [
  "invTypes.csv",
  "invGroups.csv",
  "invCategories.csv",
  "dgmTypeAttributes.csv",
  "dgmTypeEffects.csv",
  "dgmAttributeTypes.csv",
  "dgmEffects.csv"
];

async function main() {
  await mkdir(sdeRoot, { recursive: true });
  const previous = await loadManifest();

  const fileHashes = {};
  const rawByName = {};
  let downloaded = false;

  for (const name of requiredFiles) {
    const url = `${sourceBase}/${name}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      rawByName[name] = text;
      fileHashes[name] = sha256(text);
      downloaded = true;
      log(`fetched ${name}`);
    } catch (error) {
      log(`failed to fetch ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!downloaded) {
    if (previous) {
      log("network unavailable; reusing existing SDE cache metadata.");
      return;
    }

    const fallbackVersion = `offline-${new Date().toISOString().slice(0, 10)}`;
    const fallbackDir = path.join(sdeRoot, "raw", fallbackVersion);
    await mkdir(fallbackDir, { recursive: true });
    for (const name of requiredFiles) {
      const filePath = path.join(fallbackDir, name);
      if (!existsSync(filePath)) {
        await writeFile(filePath, "{}\n", "utf8");
      }
      fileHashes[name] = "offline-placeholder";
    }

    const fallbackManifest = {
      source: sourceBase,
      version: fallbackVersion,
      generatedAt: new Date().toISOString(),
      files: requiredFiles,
      fileHashes
    };
    await writeFile(manifestPath, `${JSON.stringify(fallbackManifest, null, 2)}\n`, "utf8");
    log("created offline placeholder SDE cache.");
    return;
  }

  const versionHash = sha256(requiredFiles.map((name) => fileHashes[name] ?? "").join("|")).slice(0, 12);
  const version = `${new Date().toISOString().slice(0, 10)}-${versionHash}`;
  const rawDir = path.join(sdeRoot, "raw", version);
  await mkdir(rawDir, { recursive: true });

  for (const name of requiredFiles) {
    const text = rawByName[name];
    if (!text) {
      // carry forward file from previous version if available
      const previousFile =
        previous?.version ? path.join(sdeRoot, "raw", previous.version, name) : null;
      if (previousFile && existsSync(previousFile)) {
        const reused = await readFile(previousFile, "utf8");
        await writeFile(path.join(rawDir, name), reused, "utf8");
        fileHashes[name] = sha256(reused);
        log(`reused ${name} from previous cache`);
      } else {
        await writeFile(path.join(rawDir, name), "{}\n", "utf8");
        fileHashes[name] = "missing";
      }
      continue;
    }
    await writeFile(path.join(rawDir, name), text, "utf8");
  }

  const nextManifest = {
    source: sourceBase,
    version,
    generatedAt: new Date().toISOString(),
    files: requiredFiles,
    fileHashes
  };
  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  log(`SDE sync complete (${version})`);
}

async function loadManifest() {
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function log(message) {
  console.log(`[sde:sync] ${message}`);
}

main().catch((error) => {
  console.error("[sde:sync] fatal", error);
  process.exit(1);
});
