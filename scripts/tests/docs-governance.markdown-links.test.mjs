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

async function createDocsGovernanceFixture({ extraAgentsContent = "" } = {}) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "docs-governance-fixture-"));
  const docsAgentsDir = path.join(repoRoot, "docs", "agents");

  await mkdir(docsAgentsDir, { recursive: true });

  await writeFile(
    path.join(repoRoot, "AGENTS.md"),
    `# AGENTS\n\nRead first: [Agent Docs](docs/agents/index.md)\n${extraAgentsContent}`,
    "utf8"
  );
  await writeFile(
    path.join(docsAgentsDir, "index.md"),
    "# Agent Docs Index\n\n[Workflow and TDD](workflow.md)\n[Quality](quality.md)\n[Combat Parity Guidance](combat-parity.md)\n",
    "utf8"
  );
  await writeFile(path.join(docsAgentsDir, "workflow.md"), "# Workflow\n", "utf8");
  await writeFile(path.join(docsAgentsDir, "quality.md"), "# Quality\n", "utf8");
  await writeFile(path.join(docsAgentsDir, "combat-parity.md"), "# Combat\n", "utf8");

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
