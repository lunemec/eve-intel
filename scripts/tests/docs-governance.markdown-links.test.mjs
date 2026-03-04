import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CHECK_DOCS_GOVERNANCE_SCRIPT = path.resolve(
  process.cwd(),
  "scripts",
  "check-docs-governance.mjs"
);
const CANONICAL_READ_ORDER_SECTION = `## Read Order

1. [Workflow and TDD](workflow.md)
2. [Quality, Changelog, and Robustness](quality.md)
3. [Combat Parity Guidance](combat-parity.md)
`;
const CANONICAL_NON_NEGOTIABLES_SECTION = `## Non-Negotiables

- Follow red/green/blue gates and the mandatory validation order from \`workflow.md\`.
- Keep behavior stable during refactors unless the behavior change is explicitly documented.
- For combat bugfixes, add fit corpus coverage and pyfa reference data before Dogma fixes.
`;
const CANONICAL_CHANGELOG_CONTENT = `# Changelog

All notable changes to this project are documented in this file.

## Unreleased
- Placeholder for in-flight release notes.

## v0.0.1 - 2026-01-01
- Initial release snapshot.
`;

async function createDocsGovernanceFixture({
  extraAgentsContent = "",
  agentsContentOverride = null,
  docsIndexContentOverride = null,
  changelogContentOverride = null,
  includeAgentsIndexLink = true,
  includeMandatoryMarker = true,
  includeReadOrder = true,
  readOrderSectionOverride = null,
  includeNonNegotiables = true,
  nonNegotiablesSectionOverride = null,
  includeDocumentationFormat = true,
  documentationFormatSectionOverride = null,
  includeMaintenanceWorkflow = true,
  maintenanceWorkflowSectionOverride = null
} = {}) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "docs-governance-fixture-"));
  const docsAgentsDir = path.join(repoRoot, "docs", "agents");

  await mkdir(docsAgentsDir, { recursive: true });

  const readOrderSection =
    readOrderSectionOverride ??
    (includeReadOrder ? `\n${CANONICAL_READ_ORDER_SECTION}` : "");
  const nonNegotiablesSection =
    nonNegotiablesSectionOverride ??
    (includeNonNegotiables ? `\n${CANONICAL_NON_NEGOTIABLES_SECTION}` : "");
  const documentationFormatSection =
    documentationFormatSectionOverride ??
    (includeDocumentationFormat
      ? "\n## Documentation Format\n\n- Keep AGENTS and docs index roles explicit.\n"
      : "");
  const maintenanceWorkflowSection =
    maintenanceWorkflowSectionOverride ??
    (includeMaintenanceWorkflow
      ? "\n## Maintenance Workflow\n\n1. Keep AGENTS and docs index roles aligned.\n"
      : "");
  const agentsIndexLinkLine = includeAgentsIndexLink
    ? "Read first: [Agent Docs](docs/agents/index.md)\n"
    : "";
  const mandatoryMarkerBlock = includeMandatoryMarker
    ? "\nMandatory:\n- Keep AGENTS compact.\n"
    : "";
  const defaultAgentsContent = `# AGENTS.md\n\n${agentsIndexLinkLine}${mandatoryMarkerBlock}${extraAgentsContent}`;
  const agentsContent = agentsContentOverride ?? defaultAgentsContent;

  await writeFile(
    path.join(repoRoot, "AGENTS.md"),
    agentsContent,
    "utf8"
  );
  await writeFile(
    path.join(docsAgentsDir, "index.md"),
    docsIndexContentOverride ??
      `# Agent Docs Index\n\n[Workflow and TDD](workflow.md)\n[Quality](quality.md)\n[Combat Parity Guidance](combat-parity.md)\n${readOrderSection}${nonNegotiablesSection}${documentationFormatSection}${maintenanceWorkflowSection}`,
    "utf8"
  );
  await writeFile(path.join(docsAgentsDir, "workflow.md"), "# Workflow\n", "utf8");
  await writeFile(path.join(docsAgentsDir, "quality.md"), "# Quality\n", "utf8");
  await writeFile(path.join(docsAgentsDir, "combat-parity.md"), "# Combat\n", "utf8");
  await writeFile(
    path.join(repoRoot, "CHANGELOG.md"),
    changelogContentOverride ?? CANONICAL_CHANGELOG_CONTENT,
    "utf8"
  );

  return repoRoot;
}

function runDocsGovernanceCheck(repoRoot) {
  try {
    const stdout = execFileSync("node", [CHECK_DOCS_GOVERNANCE_SCRIPT], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    return {
      exitCode: 0,
      stdout,
      stderr: ""
    };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? ""
    };
  }
}

describe("check-docs-governance markdown parsing", () => {
  it("fails when docs/agents/index.md is missing the Read Order section", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      includeReadOrder: false
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing required section docs/agents/index.md -> ## Read Order");
  });

  it("fails when docs/agents/index.md is missing the Non-Negotiables section", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      includeNonNegotiables: false
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "missing required section docs/agents/index.md -> ## Non-Negotiables"
    );
  });

  it("fails when docs/agents/index.md is missing the Documentation Format section", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      includeDocumentationFormat: false
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "missing required section docs/agents/index.md -> ## Documentation Format"
    );
  });

  it("passes when docs/agents/index.md includes all required section markers", async () => {
    const repoRoot = await createDocsGovernanceFixture();

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("fails when Read Order is missing a required canonical link", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      readOrderSectionOverride: `## Read Order

1. [Workflow and TDD](workflow.md)
2. [Quality, Changelog, and Robustness](quality.md)
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("read order canonical links invariant failed docs/agents/index.md");
  });

  it("fails when Read Order uses a non-canonical link label", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      readOrderSectionOverride: `## Read Order

1. [Workflow and TDD](workflow.md)
2. [Quality](quality.md)
3. [Combat Parity Guidance](combat-parity.md)
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("read order canonical links invariant failed docs/agents/index.md");
  });

  it("fails when Read Order uses a non-canonical link target", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      readOrderSectionOverride: `## Read Order

1. [Workflow and TDD](workflow.md)
2. [Quality, Changelog, and Robustness](combat-parity.md)
3. [Combat Parity Guidance](combat-parity.md)
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("read order canonical links invariant failed docs/agents/index.md");
  });

  it("fails when Read Order uses the canonical links out of order", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      readOrderSectionOverride: `## Read Order

1. [Workflow and TDD](workflow.md)
2. [Combat Parity Guidance](combat-parity.md)
3. [Quality, Changelog, and Robustness](quality.md)
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("read order canonical links invariant failed docs/agents/index.md");
  });

  it("passes when Read Order uses the canonical links in canonical order", async () => {
    const repoRoot = await createDocsGovernanceFixture();

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("fails when Non-Negotiables is missing a canonical bullet", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      nonNegotiablesSectionOverride: `## Non-Negotiables

- Follow red/green/blue gates and the mandatory validation order from \`workflow.md\`.
- Keep behavior stable during refactors unless the behavior change is explicitly documented.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "non-negotiables canonical bullets invariant failed docs/agents/index.md"
    );
  });

  it("fails when Non-Negotiables has text drift in a canonical bullet", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      nonNegotiablesSectionOverride: `## Non-Negotiables

- Follow red/green/blue gates and the mandatory validation order from \`workflow.md\`.
- Keep behavior stable during refactors unless behavior changes are documented.
- For combat bugfixes, add fit corpus coverage and pyfa reference data before Dogma fixes.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "non-negotiables canonical bullets invariant failed docs/agents/index.md"
    );
  });

  it("fails when Non-Negotiables canonical bullets are out of order", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      nonNegotiablesSectionOverride: `## Non-Negotiables

- Follow red/green/blue gates and the mandatory validation order from \`workflow.md\`.
- For combat bugfixes, add fit corpus coverage and pyfa reference data before Dogma fixes.
- Keep behavior stable during refactors unless the behavior change is explicitly documented.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "non-negotiables canonical bullets invariant failed docs/agents/index.md"
    );
  });

  it("passes when Non-Negotiables uses canonical bullets in canonical order", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      nonNegotiablesSectionOverride: CANONICAL_NON_NEGOTIABLES_SECTION
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("fails when docs/agents/index.md has required sections out of canonical order", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      docsIndexContentOverride: `# Agent Docs Index

[Workflow and TDD](workflow.md)
[Quality](quality.md)
[Combat Parity Guidance](combat-parity.md)

${CANONICAL_NON_NEGOTIABLES_SECTION}

## Read Order
1. [Workflow and TDD](workflow.md)
2. [Quality, Changelog, and Robustness](quality.md)
3. [Combat Parity Guidance](combat-parity.md)

## Documentation Format
- Keep AGENTS and docs index roles explicit.

## Maintenance Workflow
1. Keep AGENTS and docs index roles aligned.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("required sections out of canonical order docs/agents/index.md");
  });

  it("passes when docs/agents/index.md keeps required sections in canonical order", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      docsIndexContentOverride: `# Agent Docs Index

[Workflow and TDD](workflow.md)
[Quality](quality.md)
[Combat Parity Guidance](combat-parity.md)

## Read Order
1. [Workflow and TDD](workflow.md)
2. [Quality, Changelog, and Robustness](quality.md)
3. [Combat Parity Guidance](combat-parity.md)

${CANONICAL_NON_NEGOTIABLES_SECTION}

## Documentation Format
- Keep AGENTS and docs index roles explicit.

## Maintenance Workflow
1. Keep AGENTS and docs index roles aligned.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("fails when docs/agents/index.md is missing the Maintenance Workflow section", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      includeMaintenanceWorkflow: false
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "missing required section docs/agents/index.md -> ## Maintenance Workflow"
    );
  });

  it("fails when docs/agents/index.md contains the Maintenance Workflow marker only inside fenced code", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      includeMaintenanceWorkflow: false,
      maintenanceWorkflowSectionOverride:
        "\n```md\n## Maintenance Workflow\n\n1. Spoofed marker inside fenced code.\n```\n"
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "missing required section docs/agents/index.md -> ## Maintenance Workflow"
    );
  });

  it("fails when docs/agents/index.md contains the Documentation Format marker only inside fenced code", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      includeDocumentationFormat: false,
      documentationFormatSectionOverride:
        "\n```md\n## Documentation Format\n\n- Spoofed marker inside fenced code.\n```\n"
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "missing required section docs/agents/index.md -> ## Documentation Format"
    );
  });

  it("fails when docs/agents/index.md does not keep # Agent Docs Index as the top heading", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      docsIndexContentOverride: `# Alternate Docs Heading

# Agent Docs Index

[Workflow and TDD](workflow.md)
[Quality](quality.md)
[Combat Parity Guidance](combat-parity.md)

## Read Order
1. [Workflow and TDD](workflow.md)
2. [Quality, Changelog, and Robustness](quality.md)
3. [Combat Parity Guidance](combat-parity.md)

${CANONICAL_NON_NEGOTIABLES_SECTION}

## Documentation Format
- Keep AGENTS and docs index roles explicit.

## Maintenance Workflow
1. Keep AGENTS and docs index roles aligned.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "docs index top heading invariant failed docs/agents/index.md -> expected # Agent Docs Index"
    );
  });

  it("fails when docs/agents/index.md is missing the canonical # Agent Docs Index heading marker", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      docsIndexContentOverride: `# Alternate Docs Heading

[Workflow and TDD](workflow.md)
[Quality](quality.md)
[Combat Parity Guidance](combat-parity.md)

## Read Order
1. [Workflow and TDD](workflow.md)
2. [Quality, Changelog, and Robustness](quality.md)
3. [Combat Parity Guidance](combat-parity.md)

${CANONICAL_NON_NEGOTIABLES_SECTION}

## Documentation Format
- Keep AGENTS and docs index roles explicit.

## Maintenance Workflow
1. Keep AGENTS and docs index roles aligned.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "missing docs index heading marker docs/agents/index.md -> # Agent Docs Index"
    );
  });

  it("passes when docs/agents/index.md keeps # Agent Docs Index as the top heading", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      docsIndexContentOverride: `# Agent Docs Index

[Workflow and TDD](workflow.md)
[Quality](quality.md)
[Combat Parity Guidance](combat-parity.md)

## Read Order
1. [Workflow and TDD](workflow.md)
2. [Quality, Changelog, and Robustness](quality.md)
3. [Combat Parity Guidance](combat-parity.md)

${CANONICAL_NON_NEGOTIABLES_SECTION}

## Documentation Format
- Keep AGENTS and docs index roles explicit.

## Maintenance Workflow
1. Keep AGENTS and docs index roles aligned.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("fails when AGENTS.md does not include the Mandatory marker block", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      includeMandatoryMarker: false
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing AGENTS mandatory marker block");
    expect(result.stderr).toContain("missing AGENTS structural marker Mandatory:");
  });

  it("fails when AGENTS.md does not include the canonical heading marker", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      agentsContentOverride: `# AGENTS

Read first: [Agent Docs](docs/agents/index.md)

Mandatory:
- Keep AGENTS compact.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing AGENTS structural marker # AGENTS.md");
  });

  it("fails when AGENTS.md does not include the Read first marker", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      agentsContentOverride: `# AGENTS.md

[Agent Docs](docs/agents/index.md)

Mandatory:
- Keep AGENTS compact.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing AGENTS structural marker Read first:");
  });

  it("fails when AGENTS.md markers are out of canonical order", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      agentsContentOverride: `# AGENTS.md

Mandatory:
- Keep AGENTS compact.

Read first: [Agent Docs](docs/agents/index.md)
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "AGENTS structural markers out of canonical order -> expected # AGENTS.md -> Read first: -> Mandatory:"
    );
  });

  it("passes when AGENTS.md markers are in canonical order", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      agentsContentOverride: `# AGENTS.md

Read first: [Agent Docs](docs/agents/index.md)

Mandatory:
- Keep AGENTS compact.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("fails when AGENTS.md exceeds the compact line-count cap", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      agentsContentOverride: `# AGENTS.md

Read first: [Agent Docs](docs/agents/index.md)

Mandatory:
- Rule 1
- Rule 2
- Rule 3
- Rule 4
- Rule 5
- Rule 6
- Rule 7
- Rule 8
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("AGENTS.md exceeds compact line cap");
  });

  it("fails when AGENTS.md exceeds the compact byte-size cap", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      agentsContentOverride: `# AGENTS.md

Read first: [Agent Docs](docs/agents/index.md)

Mandatory:
- Keep AGENTS compact.
- ${"x".repeat(560)}
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("AGENTS.md exceeds compact byte cap");
  });

  it("passes when AGENTS.md stays within the compact byte-size cap", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      agentsContentOverride: `# AGENTS.md

Read first: [Agent Docs](docs/agents/index.md)

Mandatory:
- Keep AGENTS compact.
- ${"x".repeat(120)}
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("fails when AGENTS.md is missing the required docs index link", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      includeAgentsIndexLink: false
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing required link AGENTS.md -> docs/agents/index.md");
  });

  it("passes when AGENTS.md stays compact and includes required marker and docs index link", async () => {
    const repoRoot = await createDocsGovernanceFixture();

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("fails when CHANGELOG.md does not include the Unreleased section", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      changelogContentOverride: `# Changelog

All notable changes to this project are documented in this file.

## v0.0.2 - 2026-02-01
- Release notes.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "changelog missing required section CHANGELOG.md -> ## Unreleased"
    );
  });

  it("fails when CHANGELOG.md does not keep Unreleased as the first section", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      changelogContentOverride: `# Changelog

All notable changes to this project are documented in this file.

## v0.0.2 - 2026-02-01
- Release notes.

## Unreleased
- In-flight release notes.
`
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "changelog first section invariant failed CHANGELOG.md -> expected ## Unreleased as the first section heading"
    );
  });

  it("passes when CHANGELOG.md keeps Unreleased as the first section heading", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      changelogContentOverride: CANONICAL_CHANGELOG_CONTENT
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("ignores markdown image links when validating governable local links", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      extraAgentsContent: "\n![Agent Diagram](docs/agents/missing-diagram.png)\n"
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[check:docs-governance] ok");
    expect(result.stderr).toBe("");
  });

  it("still validates standard markdown links and fails on broken local targets", async () => {
    const repoRoot = await createDocsGovernanceFixture({
      extraAgentsContent: "\n[Broken Link](docs/agents/missing-required-doc.md)\n"
    });

    const result = runDocsGovernanceCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("broken local link AGENTS.md -> docs/agents/missing-required-doc.md");
  });
});
