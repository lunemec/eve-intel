import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PREFIX = "[check:docs-governance]";
const REPO_ROOT = process.cwd();

const REQUIRED_FILES = [
  "AGENTS.md",
  "docs/agents/index.md",
  "docs/agents/workflow.md",
  "docs/agents/quality.md",
  "docs/agents/combat-parity.md"
];

const SCANNED_FILES = ["AGENTS.md", "docs/agents/index.md"];

const REQUIRED_LINKS = [
  { source: "AGENTS.md", target: "docs/agents/index.md" },
  { source: "docs/agents/index.md", target: "docs/agents/workflow.md" },
  { source: "docs/agents/index.md", target: "docs/agents/quality.md" },
  { source: "docs/agents/index.md", target: "docs/agents/combat-parity.md" }
];

const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/g;

function toRepoRelativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function normalizePathFromRepo(filePath) {
  return toRepoRelativePath(path.resolve(REPO_ROOT, filePath));
}

function extractRawTargets(content) {
  const targets = [];
  for (const match of content.matchAll(MARKDOWN_LINK_PATTERN)) {
    const matchIndex = match.index ?? -1;
    if (matchIndex > 0 && content[matchIndex - 1] === "!") {
      continue;
    }
    targets.push(match[1] ?? "");
  }
  return targets;
}

function normalizeLinkTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  const withoutBrackets =
    trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1).trim() : trimmed;
  const whitespaceIndex = withoutBrackets.search(/\s/);
  if (whitespaceIndex >= 0) {
    return withoutBrackets.slice(0, whitespaceIndex);
  }
  return withoutBrackets;
}

function isIgnoredLinkTarget(target) {
  const lowerTarget = target.toLowerCase();
  return (
    lowerTarget.startsWith("http://") ||
    lowerTarget.startsWith("https://") ||
    lowerTarget.startsWith("mailto:") ||
    lowerTarget.startsWith("tel:") ||
    target.startsWith("#")
  );
}

function extractLinkPath(target) {
  const hashIndex = target.indexOf("#");
  const beforeHash = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const queryIndex = beforeHash.indexOf("?");
  return queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
}

function resolveTargetPath(sourceFile, linkPath) {
  if (!linkPath) {
    const sourceAbsPath = path.resolve(REPO_ROOT, sourceFile);
    return {
      absolutePath: sourceAbsPath,
      repoRelativePath: toRepoRelativePath(sourceAbsPath)
    };
  }

  if (linkPath.startsWith("/")) {
    const targetAbsPath = path.resolve(REPO_ROOT, linkPath.slice(1));
    return {
      absolutePath: targetAbsPath,
      repoRelativePath: toRepoRelativePath(targetAbsPath)
    };
  }

  const sourceAbsPath = path.resolve(REPO_ROOT, sourceFile);
  const targetAbsPath = path.resolve(path.dirname(sourceAbsPath), linkPath);
  return {
    absolutePath: targetAbsPath,
    repoRelativePath: toRepoRelativePath(targetAbsPath)
  };
}

async function checkDocsGovernance() {
  const errors = [];
  const resolvedLinksBySource = new Map();
  let localLinks = 0;

  for (const requiredFile of REQUIRED_FILES) {
    const requiredAbsPath = path.resolve(REPO_ROOT, requiredFile);
    if (!existsSync(requiredAbsPath)) {
      errors.push(`missing required file ${requiredFile}`);
    }
  }

  for (const scannedFile of SCANNED_FILES) {
    const scannedAbsPath = path.resolve(REPO_ROOT, scannedFile);
    if (!existsSync(scannedAbsPath)) {
      continue;
    }

    const content = await readFile(scannedAbsPath, "utf8");
    const resolvedTargets = new Set();
    for (const rawTarget of extractRawTargets(content)) {
      const normalizedTarget = normalizeLinkTarget(rawTarget);
      if (isIgnoredLinkTarget(normalizedTarget)) {
        continue;
      }

      const linkPath = extractLinkPath(normalizedTarget).trim();
      const resolvedTarget = resolveTargetPath(scannedFile, linkPath);
      localLinks += 1;
      resolvedTargets.add(resolvedTarget.repoRelativePath);

      if (!existsSync(resolvedTarget.absolutePath)) {
        errors.push(
          `broken local link ${scannedFile} -> ${normalizedTarget} (resolved ${resolvedTarget.repoRelativePath}: not found)`
        );
      }
    }
    resolvedLinksBySource.set(scannedFile, resolvedTargets);
  }

  for (const requiredLink of REQUIRED_LINKS) {
    const expectedTarget = normalizePathFromRepo(requiredLink.target);
    const sourceLinks = resolvedLinksBySource.get(requiredLink.source);
    if (!sourceLinks?.has(expectedTarget)) {
      errors.push(`missing required link ${requiredLink.source} -> ${requiredLink.target}`);
    }
  }

  return { ok: errors.length === 0, errors, localLinks };
}

async function main() {
  const result = await checkDocsGovernance();
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`${PREFIX} ${error}`);
    }
    return 1;
  }

  console.log(
    `${PREFIX} ok requiredFiles=${REQUIRED_FILES.length} requiredLinks=${REQUIRED_LINKS.length} scannedFiles=${SCANNED_FILES.length} localLinks=${result.localLinks}`
  );
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(`${PREFIX} fatal`, error);
    process.exit(1);
  });
