import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const releaseDir = path.join(repoRoot, "release");
const packageJsonPath = path.join(repoRoot, "package.json");

const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
const defaultTag = `v${pkg.version}`;
const tag = process.argv[2] ?? process.env.RELEASE_TAG ?? defaultTag;

if (!existsSync(releaseDir)) {
  fail(`Release directory not found: ${releaseDir}. Run "npm run desktop:dist" first.`);
}

const files = await collectReleaseFiles(releaseDir);
if (files.length === 0) {
  fail(`No releasable files found in ${releaseDir}. Expected .exe/.blockmap/.yml artifacts.`);
}

await run("gh", ["--version"]);

const releaseExists = await commandSucceeds("gh", ["release", "view", tag]);
if (releaseExists) {
  await run("gh", ["release", "upload", tag, ...files, "--clobber"]);
  log(`Updated existing GitHub release: ${tag}`);
} else {
  await run("gh", [
    "release",
    "create",
    tag,
    ...files,
    "--generate-notes",
    "--title",
    `EVE Intel ${tag}`
  ]);
  log(`Created GitHub release: ${tag}`);
}

log(`Uploaded ${files.length} artifact(s):`);
for (const file of files) {
  log(`- ${path.relative(repoRoot, file)}`);
}

async function collectReleaseFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (
      entry.name.endsWith(".exe") ||
      entry.name.endsWith(".blockmap") ||
      entry.name.endsWith(".yml")
    ) {
      files.push(full);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function run(cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
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
    const child = spawn(cmd, args, { stdio: "ignore", shell: process.platform === "win32" });
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
