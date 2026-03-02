import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyDogmaArtifactRetentionPolicy,
  buildDogmaManifest
} from "../lib/dogma-artifact-policy.mjs";
import { checkDogmaArtifactConsistency } from "../lib/dogma-artifact-consistency.mjs";
import {
  HERMETIC_SDE_BUILD_ENV,
  isHermeticSdeBuildEnabled,
  resolveSdePrebuildScripts
} from "../lib/prebuild-sde.mjs";

async function createDogmaArtifactFixture() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "dogma-artifact-consistency-"));
  const runtimeDir = path.join(repoRoot, "public", "data");
  const retentionDir = path.join(repoRoot, "data", "sde", "artifacts");
  const archiveDir = path.join(retentionDir, "dogma-packs");
  const retentionIndexPath = path.join(retentionDir, "dogma-pack-retention.json");
  const packFile = "dogma-pack.2026-02-22-fixture.json";
  const archivePackFile = "dogma-pack.2026-02-21-fixture.json";
  const packText = "{\"fixture\":true}\n";
  const archiveText = "{\"fixture\":\"archive\"}\n";
  const generatedAt = "2026-02-22T08:00:00.000Z";
  const packHash = createHash("sha256").update(packText).digest("hex");
  const archiveHash = createHash("sha256").update(archiveText).digest("hex");

  await mkdir(runtimeDir, { recursive: true });
  await mkdir(archiveDir, { recursive: true });
  await writeFile(path.join(runtimeDir, packFile), packText, "utf8");
  await writeFile(path.join(archiveDir, archivePackFile), archiveText, "utf8");

  await writeFile(
    retentionIndexPath,
    `${JSON.stringify(
      {
        policyVersion: 1,
        updatedAt: generatedAt,
        activeVersion: "2026-02-22-fixture",
        activePackFile: packFile,
        runtimeDir: "public/data",
        archiveDir: "data/sde/artifacts/dogma-packs",
        entries: [
          {
            packFile: archivePackFile,
            version: "2026-02-21-fixture",
            sha256: archiveHash,
            location: "archive",
            lastSeenAt: generatedAt,
            archivedAt: generatedAt
          },
          {
            packFile,
            version: "2026-02-22-fixture",
            sha256: packHash,
            location: "runtime",
            lastSeenAt: generatedAt
          }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const manifest = buildDogmaManifest({
    activeVersion: "2026-02-22-fixture",
    packFile,
    sha256: packHash,
    generatedAt,
    retention: {
      policyVersion: 1,
      runtimePackCount: 1,
      archivedPackCount: 1,
      archiveIndexFile: "data/sde/artifacts/dogma-pack-retention.json",
      archiveDir: "data/sde/artifacts/dogma-packs"
    }
  });

  await writeFile(path.join(runtimeDir, "dogma-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    repoRoot,
    runtimeDir,
    archiveDir,
    packFile
  };
}

describe("repository artifact hygiene", () => {
  it("has no tracked __pycache__ directories or .pyc files", () => {
    const trackedFiles = execFileSync("git", ["ls-files"], {
      cwd: process.cwd(),
      encoding: "utf8"
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const forbiddenArtifacts = trackedFiles.filter(
      (path) => path.includes("__pycache__/") || path.endsWith(".pyc")
    );

    expect(forbiddenArtifacts).toEqual([]);
  });

  it("archives non-active runtime dogma packs and keeps only the active runtime pack", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-retention-policy-"));
    const runtimeDir = path.join(tempDir, "public", "data");
    const archiveDir = path.join(tempDir, "data", "sde", "artifacts", "dogma-packs");
    const activePackFile = "dogma-pack.v2.json";
    const previousPackFile = "dogma-pack.v1.json";

    await mkdir(runtimeDir, { recursive: true });
    await writeFile(path.join(runtimeDir, previousPackFile), "{\"version\":\"v1\"}\n", "utf8");
    await writeFile(path.join(runtimeDir, activePackFile), "{\"version\":\"v2\"}\n", "utf8");

    const result = await applyDogmaArtifactRetentionPolicy({
      runtimeDir,
      archiveDir,
      activePackFile
    });

    expect(result.activePackFile).toBe(activePackFile);
    expect(result.runtimePackFiles).toEqual([activePackFile]);
    expect(result.archivedPackFiles).toEqual([previousPackFile]);
    expect(await readFile(path.join(archiveDir, previousPackFile), "utf8")).toContain("\"v1\"");
  });

  it("fails safely when an archive pack exists with a different hash", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-retention-policy-"));
    const runtimeDir = path.join(tempDir, "public", "data");
    const archiveDir = path.join(tempDir, "data", "sde", "artifacts", "dogma-packs");
    const activePackFile = "dogma-pack.v2.json";
    const previousPackFile = "dogma-pack.v1.json";

    await mkdir(runtimeDir, { recursive: true });
    await mkdir(archiveDir, { recursive: true });
    await writeFile(path.join(runtimeDir, previousPackFile), "{\"version\":\"runtime-v1\"}\n", "utf8");
    await writeFile(path.join(runtimeDir, activePackFile), "{\"version\":\"runtime-v2\"}\n", "utf8");
    await writeFile(path.join(archiveDir, previousPackFile), "{\"version\":\"archive-v1\"}\n", "utf8");

    await expect(
      applyDogmaArtifactRetentionPolicy({
        runtimeDir,
        archiveDir,
        activePackFile
      })
    ).rejects.toThrow(/hash mismatch/i);

    expect(existsSync(path.join(runtimeDir, previousPackFile))).toBe(true);
  });

  it("builds a backward-compatible runtime manifest with retention metadata", () => {
    const manifest = buildDogmaManifest({
      activeVersion: "2026-02-22-abcdef123456",
      packFile: "dogma-pack.2026-02-22-abcdef123456.json",
      sha256: "cafebabe",
      generatedAt: "2026-02-22T08:00:00.000Z",
      retention: {
        policyVersion: 1,
        runtimePackCount: 1,
        archivedPackCount: 4,
        archiveIndexFile: "data/sde/artifacts/dogma-pack-retention.json"
      }
    });

    expect(manifest).toEqual({
      activeVersion: "2026-02-22-abcdef123456",
      packFile: "dogma-pack.2026-02-22-abcdef123456.json",
      sha256: "cafebabe",
      generatedAt: "2026-02-22T08:00:00.000Z",
      retention: {
        policyVersion: 1,
        runtimePackCount: 1,
        archivedPackCount: 4,
        archiveIndexFile: "data/sde/artifacts/dogma-pack-retention.json"
      }
    });
  });

  it("keeps default prebuild behavior backward compatible when hermetic mode is disabled", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.scripts.prebuild).toBe("node scripts/prebuild-sde.mjs");
    expect(isHermeticSdeBuildEnabled({ [HERMETIC_SDE_BUILD_ENV]: "0" })).toBe(false);
    expect(resolveSdePrebuildScripts({ [HERMETIC_SDE_BUILD_ENV]: "0" })).toEqual([
      "sde:sync",
      "sde:compile"
    ]);
  });

  it("skips network-dependent SDE sync in hermetic prebuild mode", () => {
    expect(HERMETIC_SDE_BUILD_ENV).toBe("EVE_HERMETIC_BUILD");
    expect(isHermeticSdeBuildEnabled({ [HERMETIC_SDE_BUILD_ENV]: "1" })).toBe(true);
    expect(resolveSdePrebuildScripts({ [HERMETIC_SDE_BUILD_ENV]: "1" })).toEqual([
      "sde:compile"
    ]);
  });

  it("exposes npm script for deterministic artifact consistency checks", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["check:artifact-consistency"]).toBe(
      "node scripts/check-artifact-consistency.mjs"
    );
  });

  it("enforces deterministic artifact bootstrap before consistency checks and hermetic build in CI validate workflow", async () => {
    const ciWorkflowPath = path.join(process.cwd(), ".github", "workflows", "ci.yml");
    const ciWorkflow = await readFile(ciWorkflowPath, "utf8");
    const validateSection = ciWorkflow.match(/jobs:\s*\n(?:.*\n)*?  validate:\s*\n([\s\S]*)/);

    expect(validateSection?.[1]).toBeDefined();

    const validateWorkflow = validateSection?.[1] ?? "";
    const bootstrapCommand = "run: npm run sde:prepare";
    const testCommand = "run: npm test";
    const consistencyCommand = "run: npm run check:artifact-consistency";
    const buildCommand = "run: npm run build";

    expect(validateWorkflow).toContain(bootstrapCommand);
    expect(validateWorkflow).toContain(testCommand);
    expect(validateWorkflow).toContain(consistencyCommand);
    expect(validateWorkflow).toContain(buildCommand);

    const bootstrapIndex = validateWorkflow.indexOf(bootstrapCommand);
    const testIndex = validateWorkflow.indexOf(testCommand);
    const consistencyIndex = validateWorkflow.indexOf(consistencyCommand);
    const buildIndex = validateWorkflow.indexOf(buildCommand);

    expect(testIndex).toBeGreaterThanOrEqual(0);
    expect(bootstrapIndex).toBeGreaterThan(testIndex);
    expect(consistencyIndex).toBeGreaterThan(bootstrapIndex);
    expect(buildIndex).toBeGreaterThan(consistencyIndex);

    const hasJobLevelHermeticEnv =
      /^\s{4}env:\s*\n(?:\s{6}.+\n)*?\s{6}EVE_HERMETIC_BUILD:\s*["']?1["']?/m.test(
        validateWorkflow
      );
    const hasBuildStepHermeticEnv =
      /- name:\s*Run typecheck and production build[\s\S]*?env:\s*\n[\s\S]*?EVE_HERMETIC_BUILD:\s*["']?1["']?[\s\S]*?run:\s*npm run build/m.test(
        validateWorkflow
      );
    const hasInlineHermeticBuildCommand = /run:\s*EVE_HERMETIC_BUILD=1\s+npm run build/m.test(
      validateWorkflow
    );

    expect(
      hasJobLevelHermeticEnv || hasBuildStepHermeticEnv || hasInlineHermeticBuildCommand
    ).toBe(true);
  });

  it("passes deterministic artifact consistency checks for coherent local SDE/dogma artifacts", async () => {
    const fixture = await createDogmaArtifactFixture();
    const result = await checkDogmaArtifactConsistency({ repoRoot: fixture.repoRoot });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.summary).toEqual({
      activeVersion: "2026-02-22-fixture",
      activePackFile: fixture.packFile,
      runtimePackFiles: [fixture.packFile],
      archivePackFiles: ["dogma-pack.2026-02-21-fixture.json"]
    });
  });

  it("fails deterministic artifact consistency checks when manifest hash drifts from runtime pack", async () => {
    const fixture = await createDogmaArtifactFixture();
    await writeFile(path.join(fixture.runtimeDir, fixture.packFile), "{\"fixture\":false}\n", "utf8");

    const result = await checkDogmaArtifactConsistency({ repoRoot: fixture.repoRoot });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/manifest sha256/i);
  });

  it("fails fast when compile input manifest reports partial SDE sync state", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-compile-partial-"));
    const sdeRoot = path.join(tempDir, "data", "sde");
    const version = "2026-02-22-partial";
    const rawDir = path.join(sdeRoot, "raw", version);
    const compileScript = path.join(process.cwd(), "scripts", "compile-dogma-pack.mjs");
    const requiredFiles = [
      "invTypes.csv",
      "invGroups.csv",
      "invCategories.csv",
      "dgmTypeAttributes.csv",
      "dgmTypeEffects.csv",
      "dgmAttributeTypes.csv",
      "dgmEffects.csv"
    ];

    await mkdir(rawDir, { recursive: true });
    await writeFile(
      path.join(rawDir, "invTypes.csv"),
      "typeID,groupID,typeName,mass\n1,10,Fixture Ship,1000\n",
      "utf8"
    );
    await writeFile(
      path.join(rawDir, "invGroups.csv"),
      "groupID,categoryID,groupName\n10,6,Fixture Group\n",
      "utf8"
    );
    await writeFile(
      path.join(rawDir, "invCategories.csv"),
      "categoryID,categoryName\n6,Ship\n",
      "utf8"
    );
    await writeFile(
      path.join(rawDir, "dgmTypeAttributes.csv"),
      "typeID,attributeID,valueFloat\n1,4,1000\n",
      "utf8"
    );
    await writeFile(
      path.join(rawDir, "dgmTypeEffects.csv"),
      "typeID,effectID\n1,11\n",
      "utf8"
    );
    await writeFile(
      path.join(rawDir, "dgmAttributeTypes.csv"),
      "attributeID,attributeName\n4,Mass\n",
      "utf8"
    );
    await writeFile(
      path.join(rawDir, "dgmEffects.csv"),
      "effectID,effectName\n11,fixtureEffect\n",
      "utf8"
    );
    await writeFile(
      path.join(sdeRoot, ".manifest.json"),
      `${JSON.stringify(
        {
          source: "https://www.fuzzwork.co.uk/dump/latest",
          version,
          generatedAt: "2026-02-22T08:00:00.000Z",
          files: requiredFiles,
          fileHashes: Object.fromEntries(requiredFiles.map((name) => [name, `${name}-hash`])),
          syncState: {
            status: "partial",
            reusedFiles: ["dgmEffects.csv"],
            placeholderFiles: [],
            missingFiles: []
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    expect(() =>
      execFileSync("node", [compileScript], {
        cwd: tempDir,
        encoding: "utf8"
      })
    ).toThrow(/partial|placeholder|invalid/i);

    expect(existsSync(path.join(tempDir, "public", "data", "dogma-manifest.json"))).toBe(false);
  });

  it("fails fast when compile input manifest contains placeholder or missing SDE hashes", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dogma-compile-placeholder-"));
    const sdeRoot = path.join(tempDir, "data", "sde");
    const version = "offline-2026-02-22";
    const rawDir = path.join(sdeRoot, "raw", version);
    const compileScript = path.join(process.cwd(), "scripts", "compile-dogma-pack.mjs");
    const requiredFiles = [
      "invTypes.csv",
      "invGroups.csv",
      "invCategories.csv",
      "dgmTypeAttributes.csv",
      "dgmTypeEffects.csv",
      "dgmAttributeTypes.csv",
      "dgmEffects.csv"
    ];

    await mkdir(rawDir, { recursive: true });
    for (const name of requiredFiles) {
      await writeFile(path.join(rawDir, name), "{}\n", "utf8");
    }
    await writeFile(
      path.join(sdeRoot, ".manifest.json"),
      `${JSON.stringify(
        {
          source: "https://www.fuzzwork.co.uk/dump/latest",
          version,
          generatedAt: "2026-02-22T08:00:00.000Z",
          files: requiredFiles,
          fileHashes: {
            "invTypes.csv": "offline-placeholder",
            "invGroups.csv": "missing",
            "invCategories.csv": "offline-placeholder",
            "dgmTypeAttributes.csv": "missing",
            "dgmTypeEffects.csv": "missing",
            "dgmAttributeTypes.csv": "offline-placeholder",
            "dgmEffects.csv": "missing"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    expect(() =>
      execFileSync("node", [compileScript], {
        cwd: tempDir,
        encoding: "utf8"
      })
    ).toThrow(/placeholder|missing|partial|invalid/i);

    expect(existsSync(path.join(tempDir, "public", "data", "dogma-manifest.json"))).toBe(false);
  });
});
