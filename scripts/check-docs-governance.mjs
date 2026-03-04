import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PREFIX = "[check:docs-governance]";
const REPO_ROOT = process.cwd();
const AGENTS_FILE = "AGENTS.md";
const CHANGELOG_FILE = "CHANGELOG.md";
const DOCS_INDEX_FILE = "docs/agents/index.md";
const DOCS_INDEX_TOP_HEADING_MARKER = "# Agent Docs Index";
const DOCS_INDEX_TOP_HEADING_PATTERN = /^(?:\uFEFF)?#\s+Agent Docs Index\s*$/m;
const FIRST_MARKDOWN_HEADING_PATTERN = /^(?:\uFEFF)?#{1,6}\s+\S.*$/m;
const CHANGELOG_UNRELEASED_SECTION_MARKER = "## Unreleased";
const AGENTS_MAX_LINES = 12;
const AGENTS_MAX_BYTES = 512;
const AGENTS_MANDATORY_BLOCK_PATTERN = /^Mandatory:\s*(?:\r?\n)+-\s+\S/im;
const AGENTS_STRUCTURAL_MARKERS = [
  { marker: "# AGENTS.md", pattern: /^#\s+AGENTS\.md\s*$/m },
  { marker: "Read first:", pattern: /^Read first:\s+/m },
  { marker: "Mandatory:", pattern: /^Mandatory:\s*$/m }
];

const REQUIRED_FILES = [
  "AGENTS.md",
  CHANGELOG_FILE,
  DOCS_INDEX_FILE,
  "docs/agents/workflow.md",
  "docs/agents/quality.md",
  "docs/agents/combat-parity.md"
];

const SCANNED_FILES = ["AGENTS.md", DOCS_INDEX_FILE];

const REQUIRED_LINKS = [
  { source: "AGENTS.md", target: DOCS_INDEX_FILE },
  { source: DOCS_INDEX_FILE, target: "docs/agents/workflow.md" },
  { source: DOCS_INDEX_FILE, target: "docs/agents/quality.md" },
  { source: DOCS_INDEX_FILE, target: "docs/agents/combat-parity.md" }
];

const REQUIRED_SECTIONS = [
  {
    file: DOCS_INDEX_FILE,
    marker: "## Read Order",
    pattern: /^##\s+Read Order\b/im
  },
  {
    file: DOCS_INDEX_FILE,
    marker: "## Non-Negotiables",
    pattern: /^##\s+Non-Negotiables\b/im
  },
  {
    file: DOCS_INDEX_FILE,
    marker: "## Documentation Format",
    pattern: /^##\s+Documentation Format\b/im
  },
  {
    file: DOCS_INDEX_FILE,
    marker: "## Maintenance Workflow",
    pattern: /^##\s+Maintenance Workflow\b/im
  }
];

const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/g;
const MARKDOWN_LINK_WITH_LABEL_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const READ_ORDER_HEADING = "Read Order";
const READ_ORDER_CANONICAL_LINKS = [
  { label: "Workflow and TDD", target: "workflow.md" },
  { label: "Quality, Changelog, and Robustness", target: "quality.md" },
  { label: "Combat Parity Guidance", target: "combat-parity.md" }
];
const NON_NEGOTIABLES_HEADING = "Non-Negotiables";
const NON_NEGOTIABLES_CANONICAL_BULLETS = [
  "Follow red/green/blue gates and the mandatory validation order from `workflow.md`.",
  "Keep behavior stable during refactors unless the behavior change is explicitly documented.",
  "For combat bugfixes, add fit corpus coverage and pyfa reference data before Dogma fixes."
];

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

function extractMarkdownLinks(content) {
  const links = [];
  for (const match of content.matchAll(MARKDOWN_LINK_WITH_LABEL_PATTERN)) {
    const matchIndex = match.index ?? -1;
    if (matchIndex > 0 && content[matchIndex - 1] === "!") {
      continue;
    }

    links.push({
      label: (match[1] ?? "").trim(),
      target: normalizeLinkTarget(match[2] ?? "")
    });
  }
  return links;
}

function extractMarkdownBullets(content) {
  const bullets = [];
  for (const line of content.split(/\r?\n/)) {
    const bulletMatch = line.match(/^\s*-\s+(.+?)\s*$/);
    if (!bulletMatch) {
      continue;
    }

    bullets.push((bulletMatch[1] ?? "").trim());
  }
  return bullets;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function stripFencedCodeBlocks(content) {
  const lines = content.split(/\r?\n/);
  const outputLines = [];
  let activeFenceChar = "";
  let activeFenceLength = 0;

  for (const line of lines) {
    if (!activeFenceChar) {
      const openingFence = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
      if (openingFence) {
        activeFenceChar = openingFence[1][0];
        activeFenceLength = openingFence[1].length;
        outputLines.push("");
        continue;
      }

      outputLines.push(line);
      continue;
    }

    const closingFence = new RegExp(`^\\s{0,3}${activeFenceChar}{${activeFenceLength},}\\s*$`);
    if (closingFence.test(line)) {
      activeFenceChar = "";
      activeFenceLength = 0;
    }
    outputLines.push("");
  }

  return outputLines.join("\n");
}

function countLines(content) {
  if (content.length === 0) {
    return 0;
  }

  const lineCount = content.split(/\r?\n/).length;
  return /\r?\n$/.test(content) ? lineCount - 1 : lineCount;
}

function countUtf8Bytes(content) {
  return Buffer.byteLength(content, "utf8");
}

function normalizeHeadingLine(headingLine) {
  return headingLine.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

function findFirstMarkdownHeading(content) {
  const match = content.match(FIRST_MARKDOWN_HEADING_PATTERN);
  if (!match) {
    return null;
  }

  return normalizeHeadingLine(match[0]);
}

function extractMarkdownHeadingsByLevel(content, level) {
  const headingPattern = new RegExp(`^(?:\\uFEFF)?#{${level}}\\s+\\S.*$`, "gm");
  const headings = [];
  for (const match of content.matchAll(headingPattern)) {
    headings.push(normalizeHeadingLine(match[0]));
  }
  return headings;
}

function extractSectionBody(content, heading) {
  const sectionStartPattern = new RegExp(
    `^##\\s+${escapeRegExp(heading)}\\b[^\\r\\n]*\\r?\\n`,
    "im"
  );
  const sectionStartMatch = sectionStartPattern.exec(content);
  if (!sectionStartMatch || typeof sectionStartMatch.index !== "number") {
    return null;
  }

  const bodyStart = sectionStartMatch.index + sectionStartMatch[0].length;
  const remainingContent = content.slice(bodyStart);
  const nextSectionMatch = /^##\s+\S.*$/m.exec(remainingContent);
  const bodyEnd = nextSectionMatch ? nextSectionMatch.index : remainingContent.length;
  return remainingContent.slice(0, bodyEnd);
}

function formatMarkdownLinkSequence(links) {
  if (links.length === 0) {
    return "(none)";
  }
  return links.map((link) => `[${link.label}](${link.target})`).join(" -> ");
}

function formatMarkdownBulletSequence(bullets) {
  if (bullets.length === 0) {
    return "(none)";
  }
  return bullets.map((bullet) => `- ${bullet}`).join(" | ");
}

async function checkDocsGovernance() {
  const errors = [];
  const resolvedLinksBySource = new Map();
  const contentByFile = new Map();
  const sectionMatchesByFile = new Map();
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
    contentByFile.set(scannedFile, content);
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

  for (const requiredSection of REQUIRED_SECTIONS) {
    const requiredAbsPath = path.resolve(REPO_ROOT, requiredSection.file);
    if (!existsSync(requiredAbsPath)) {
      continue;
    }

    const content =
      contentByFile.get(requiredSection.file) ?? (await readFile(requiredAbsPath, "utf8"));
    const parsedContent = stripFencedCodeBlocks(content);
    const sectionMatch = parsedContent.match(requiredSection.pattern);
    if (!sectionMatch) {
      errors.push(`missing required section ${requiredSection.file} -> ${requiredSection.marker}`);
      continue;
    }

    if (!sectionMatchesByFile.has(requiredSection.file)) {
      sectionMatchesByFile.set(requiredSection.file, []);
    }
    sectionMatchesByFile.get(requiredSection.file).push({
      marker: requiredSection.marker,
      index: sectionMatch.index ?? -1
    });
  }

  for (const [file, sectionMatches] of sectionMatchesByFile) {
    const requiredSectionsForFile = REQUIRED_SECTIONS.filter((requiredSection) => requiredSection.file === file);
    if (sectionMatches.length !== requiredSectionsForFile.length) {
      continue;
    }

    let inCanonicalOrder = true;
    let previousIndex = -1;
    for (const sectionMatch of sectionMatches) {
      if (sectionMatch.index <= previousIndex) {
        inCanonicalOrder = false;
        break;
      }
      previousIndex = sectionMatch.index;
    }

    if (!inCanonicalOrder) {
      errors.push(
        `required sections out of canonical order ${file} -> expected ${requiredSectionsForFile
          .map((section) => section.marker)
          .join(" -> ")}`
      );
    }
  }

  const docsIndexContent = contentByFile.get(DOCS_INDEX_FILE);
  if (typeof docsIndexContent === "string") {
    const parsedDocsIndexContent = stripFencedCodeBlocks(docsIndexContent);
    if (!DOCS_INDEX_TOP_HEADING_PATTERN.test(parsedDocsIndexContent)) {
      errors.push(
        `missing docs index heading marker ${DOCS_INDEX_FILE} -> ${DOCS_INDEX_TOP_HEADING_MARKER}`
      );
    } else {
      const firstHeading = findFirstMarkdownHeading(parsedDocsIndexContent);
      const normalizedExpectedHeading = normalizeHeadingLine(DOCS_INDEX_TOP_HEADING_MARKER);
      if (firstHeading !== normalizedExpectedHeading) {
        errors.push(
          `docs index top heading invariant failed ${DOCS_INDEX_FILE} -> expected ${DOCS_INDEX_TOP_HEADING_MARKER}`
        );
      }
    }

    const readOrderSectionBody = extractSectionBody(parsedDocsIndexContent, READ_ORDER_HEADING);
    if (typeof readOrderSectionBody === "string") {
      const readOrderLinks = extractMarkdownLinks(readOrderSectionBody);
      const hasCanonicalReadOrderLinks =
        readOrderLinks.length === READ_ORDER_CANONICAL_LINKS.length &&
        readOrderLinks.every((readOrderLink, index) => {
          const canonicalLink = READ_ORDER_CANONICAL_LINKS[index];
          return (
            readOrderLink.label === canonicalLink.label &&
            readOrderLink.target === canonicalLink.target
          );
        });

      if (!hasCanonicalReadOrderLinks) {
        errors.push(
          `read order canonical links invariant failed ${DOCS_INDEX_FILE} -> expected ${formatMarkdownLinkSequence(
            READ_ORDER_CANONICAL_LINKS
          )}; found ${formatMarkdownLinkSequence(readOrderLinks)}`
        );
      }
    }

    const nonNegotiablesSectionBody = extractSectionBody(
      parsedDocsIndexContent,
      NON_NEGOTIABLES_HEADING
    );
    if (typeof nonNegotiablesSectionBody === "string") {
      const nonNegotiablesBullets = extractMarkdownBullets(nonNegotiablesSectionBody);
      const hasCanonicalNonNegotiablesBullets =
        nonNegotiablesBullets.length === NON_NEGOTIABLES_CANONICAL_BULLETS.length &&
        nonNegotiablesBullets.every(
          (nonNegotiablesBullet, index) =>
            nonNegotiablesBullet === NON_NEGOTIABLES_CANONICAL_BULLETS[index]
        );

      if (!hasCanonicalNonNegotiablesBullets) {
        errors.push(
          `non-negotiables canonical bullets invariant failed ${DOCS_INDEX_FILE} -> expected ${formatMarkdownBulletSequence(
            NON_NEGOTIABLES_CANONICAL_BULLETS
          )}; found ${formatMarkdownBulletSequence(nonNegotiablesBullets)}`
        );
      }
    }
  }

  const agentsContent = contentByFile.get(AGENTS_FILE);
  if (typeof agentsContent === "string") {
    const parsedAgentsContent = stripFencedCodeBlocks(agentsContent);
    const markerMatches = [];
    for (const structuralMarker of AGENTS_STRUCTURAL_MARKERS) {
      const markerMatch = parsedAgentsContent.match(structuralMarker.pattern);
      if (!markerMatch) {
        errors.push(`missing AGENTS structural marker ${structuralMarker.marker}`);
        continue;
      }

      markerMatches.push({
        marker: structuralMarker.marker,
        index: markerMatch.index ?? -1
      });
    }

    if (markerMatches.length === AGENTS_STRUCTURAL_MARKERS.length) {
      let inCanonicalOrder = true;
      let previousIndex = -1;
      for (const markerMatch of markerMatches) {
        if (markerMatch.index <= previousIndex) {
          inCanonicalOrder = false;
          break;
        }
        previousIndex = markerMatch.index;
      }

      if (!inCanonicalOrder) {
        errors.push(
          `AGENTS structural markers out of canonical order -> expected ${AGENTS_STRUCTURAL_MARKERS.map(
            (marker) => marker.marker
          ).join(" -> ")}`
        );
      }
    }

    const agentsByteCount = countUtf8Bytes(agentsContent);
    if (agentsByteCount > AGENTS_MAX_BYTES) {
      errors.push(
        `${AGENTS_FILE} exceeds compact byte cap ${AGENTS_MAX_BYTES} (found ${agentsByteCount})`
      );
    }

    const agentsLineCount = countLines(agentsContent);
    if (agentsLineCount > AGENTS_MAX_LINES) {
      errors.push(
        `${AGENTS_FILE} exceeds compact line cap ${AGENTS_MAX_LINES} (found ${agentsLineCount})`
      );
    }

    if (!AGENTS_MANDATORY_BLOCK_PATTERN.test(parsedAgentsContent)) {
      errors.push("missing AGENTS mandatory marker block");
    }
  }

  const changelogAbsPath = path.resolve(REPO_ROOT, CHANGELOG_FILE);
  if (existsSync(changelogAbsPath)) {
    const changelogContent = await readFile(changelogAbsPath, "utf8");
    const parsedChangelogContent = stripFencedCodeBlocks(changelogContent);
    const changelogSectionHeadings = extractMarkdownHeadingsByLevel(parsedChangelogContent, 2);
    const hasUnreleasedSection = changelogSectionHeadings.includes(
      CHANGELOG_UNRELEASED_SECTION_MARKER
    );

    if (!hasUnreleasedSection) {
      errors.push(
        `changelog missing required section ${CHANGELOG_FILE} -> ${CHANGELOG_UNRELEASED_SECTION_MARKER}`
      );
    }

    if (
      changelogSectionHeadings.length > 0 &&
      changelogSectionHeadings[0] !== CHANGELOG_UNRELEASED_SECTION_MARKER
    ) {
      errors.push(
        `changelog first section invariant failed ${CHANGELOG_FILE} -> expected ${CHANGELOG_UNRELEASED_SECTION_MARKER} as the first section heading`
      );
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
    `${PREFIX} ok requiredFiles=${REQUIRED_FILES.length} requiredLinks=${REQUIRED_LINKS.length} requiredSections=${REQUIRED_SECTIONS.length} scannedFiles=${SCANNED_FILES.length} localLinks=${result.localLinks}`
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
