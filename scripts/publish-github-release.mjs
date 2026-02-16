import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const releaseDir = path.join(repoRoot, "release");
const packageJsonPath = path.join(repoRoot, "package.json");

const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
const version = String(pkg.version);
const defaultTag = `v${version}`;
const cliArgs = process.argv.slice(2);
const requireAllTargets = cliArgs.includes("--full") || process.env.RELEASE_REQUIRE_ALL === "1";
const tagArg = cliArgs.find((arg) => !arg.startsWith("--"));
const tag = tagArg ?? process.env.RELEASE_TAG ?? defaultTag;

const targetBuilds = [
  {
    id: "windows",
    script: "desktop:dist:win",
    supportedHosts: ["win32"],
    required: [
      {
        name: "Windows installer (.exe)",
        match: (fileName) => fileNameHasVersion(fileName, version) && fileName.endsWith(".exe")
      },
      {
        name: "Windows installer blockmap (.exe.blockmap)",
        match: (fileName) => fileNameHasVersion(fileName, version) && fileName.endsWith(".exe.blockmap")
      }
    ]
  },
  {
    id: "linux",
    script: "desktop:dist:linux",
    supportedHosts: ["linux"],
    required: [
      {
        name: "Linux AppImage",
        match: (fileName) => fileName.includes(version) && fileName.endsWith(".AppImage")
      },
      {
        name: "Linux tar.gz",
        match: (fileName) => fileName.includes(version) && fileName.endsWith(".tar.gz")
      }
    ]
  },
  {
    id: "macos-arm64",
    script: "desktop:dist:mac:arm64",
    supportedHosts: ["darwin"],
    required: [
      {
        name: "macOS arm64 DMG",
        match: (fileName) => fileName.includes(version) && fileName.includes("arm64") && fileName.endsWith(".dmg")
      },
      {
        name: "macOS arm64 ZIP",
        match: (fileName) => fileName.includes(version) && fileName.includes("arm64") && fileName.endsWith(".zip")
      }
    ]
  }
];

if (!existsSync(releaseDir)) {
  await ensureReleaseDir();
}

await run("gh", ["--version"]);

let releaseFiles = await collectReleaseFiles(releaseDir);
const requiredTargets = requireAllTargets
  ? targetBuilds
  : targetBuilds.filter((target) => target.supportedHosts.includes(process.platform));

if (requiredTargets.some((target) => target.id === "windows")) {
  const latestInfo = await readLatestYmlInfo();
  if (!latestInfo || latestInfo.version !== version || !fileNameHasVersion(latestInfo.path ?? "", version)) {
    log(
      `latest.yml is missing or stale (found version=${latestInfo?.version ?? "none"}, path=${latestInfo?.path ?? "none"}). Rebuilding Windows artifacts...`
    );
    if (!targetBuilds[0].supportedHosts.includes(process.platform)) {
      fail("latest.yml is stale for Windows updater metadata, but current host cannot build Windows artifacts.");
    }
    await runNpmScript(targetBuilds[0].script);
    releaseFiles = await collectReleaseFiles(releaseDir);
  }
}

let missing = evaluateMissingTargets(releaseFiles, requiredTargets);

if (missing.length > 0) {
  log(`Missing release artifacts for version ${version}. Building missing targets...`);
  for (const target of missing) {
    if (!target.supportedHosts.includes(process.platform)) {
      log(
        `Skipping auto-build for ${target.id} on host ${process.platform}. ` +
          `Build this target on one of: ${target.supportedHosts.join(", ")}`
      );
      continue;
    }
    log(`Running npm script: ${target.script}`);
    await runNpmScript(target.script);
    releaseFiles = await collectReleaseFiles(releaseDir);
  }
}

missing = evaluateMissingTargets(releaseFiles, requiredTargets);
if (missing.length > 0) {
  const details = missing
    .map(
      (target) =>
        `${target.id}: ${target.required
          .filter((rule) => !releaseFiles.some((file) => rule.match(path.basename(file))))
          .map((rule) => rule.name)
          .join(", ")}`
    )
    .join(" | ");
  fail(
    `Not all required artifacts are present for version ${version} (${requireAllTargets ? "full" : "host-scoped"} mode). ` +
      `Missing -> ${details}. Build each missing target on a supported host OS and place files in release/ before running release upload.`
  );
}

const uploadFiles = filterUploadFiles(releaseFiles, version);
if (uploadFiles.length === 0) {
  fail(`No releasable files found in ${releaseDir} for version ${version}.`);
}

const releaseExists = await commandSucceeds("gh", ["release", "view", tag]);
if (releaseExists) {
  await run("gh", ["release", "upload", tag, ...uploadFiles, "--clobber"]);
  log(`Updated existing GitHub release: ${tag}`);
} else {
  await run("gh", [
    "release",
    "create",
    tag,
    ...uploadFiles,
    "--generate-notes",
    "--title",
    `EVE Intel ${tag}`
  ]);
  log(`Created GitHub release: ${tag}`);
}

log(`Uploaded ${uploadFiles.length} artifact(s):`);
for (const file of uploadFiles) {
  log(`- ${path.relative(repoRoot, file)}`);
}

async function ensureReleaseDir() {
  fail(`Release directory not found: ${releaseDir}.`);
}

async function collectReleaseFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function readLatestYmlInfo() {
  const latestPath = path.join(releaseDir, "latest.yml");
  if (!existsSync(latestPath)) {
    return null;
  }

  const content = await readFile(latestPath, "utf8");
  const versionMatch = content.match(/^version:\s*(.+)$/m);
  const pathMatch = content.match(/^path:\s*(.+)$/m);
  return {
    version: versionMatch ? versionMatch[1].trim() : null,
    path: pathMatch ? pathMatch[1].trim() : null
  };
}

function evaluateMissingTargets(files, targets) {
  return targets.filter((target) =>
    target.required.some((rule) => !files.some((file) => rule.match(path.basename(file))))
  );
}

function filterUploadFiles(files, currentVersion) {
  return files.filter((file) => {
    const name = path.basename(file);
    if (name.endsWith(".yml")) {
      return true;
    }
    if (!fileNameHasVersion(name, currentVersion)) {
      return false;
    }
    return (
      name.endsWith(".exe") ||
      name.endsWith(".blockmap") ||
      name.endsWith(".AppImage") ||
      name.endsWith(".dmg") ||
      name.endsWith(".zip") ||
      name.endsWith(".tar.gz") ||
      name.endsWith(".deb") ||
      name.endsWith(".rpm") ||
      name.endsWith(".snap") ||
      name.endsWith(".pkg") ||
      name.endsWith(".tar.xz") ||
      name.endsWith(".pkg.tar.zst")
    );
  });
}

function fileNameHasVersion(name, currentVersion) {
  return (
    name.includes(` ${currentVersion}.`) ||
    name.includes(`-${currentVersion}`) ||
    name.includes(`_${currentVersion}`) ||
    name.includes(`v${currentVersion}`)
  );
}

function runNpmScript(scriptName) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return run(process.execPath, [npmExecPath, "run", scriptName]);
  }
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return run(npmCmd, ["run", scriptName]);
}

async function run(cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} failed with exit code ${code ?? -1}`));
      }
    });
  });
}

async function commandSucceeds(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "ignore", shell: false });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

function log(message) {
  console.log(`[release] ${message}`);
}

function fail(message) {
  console.error(`[release] ${message}`);
  process.exit(1);
}
