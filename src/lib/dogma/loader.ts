import type { DogmaManifest, DogmaPack } from "./types";

type LoaderState = {
  manifest: DogmaManifest;
  pack: DogmaPack;
};

let memoized: Promise<LoaderState> | null = null;

export async function loadDogmaData(force = false): Promise<LoaderState> {
  if (!memoized || force) {
    memoized = loadInternal();
  }
  return memoized;
}

export async function getDogmaVersion(): Promise<string> {
  const data = await loadDogmaData();
  return data.manifest.activeVersion;
}

async function loadInternal(): Promise<LoaderState> {
  const baseHref =
    typeof globalThis.location?.href === "string" ? globalThis.location.href : "http://localhost/";
  const manifestUrl = new URL("data/dogma-manifest.json", baseHref).toString();
  const manifestRes = await fetch(manifestUrl, {
    headers: { Accept: "application/json" }
  });
  if (!manifestRes.ok) {
    throw new Error(`Dogma manifest fetch failed (${manifestRes.status})`);
  }
  const manifest = (await manifestRes.json()) as DogmaManifest;
  if (!manifest?.packFile) {
    throw new Error("Dogma manifest is invalid.");
  }

  const packUrl = new URL(`data/${manifest.packFile}`, baseHref).toString();
  const packRes = await fetch(packUrl, {
    headers: { Accept: "application/json" }
  });
  if (!packRes.ok) {
    throw new Error(`Dogma pack fetch failed (${packRes.status})`);
  }
  const pack = (await packRes.json()) as DogmaPack;
  if (!Array.isArray(pack?.types)) {
    throw new Error("Dogma pack payload is invalid.");
  }

  return { manifest, pack };
}
