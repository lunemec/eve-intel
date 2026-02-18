import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

function extractImportSpecifiers(sourceText, modulePath) {
  const escapedModulePath = modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const importMatches = sourceText.matchAll(
    new RegExp(`import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*["']${escapedModulePath}["']`, "gm")
  );
  const specifiers = [];

  for (const match of importMatches) {
    specifiers.push(
      ...match[1]
        .split(",")
        .map((part) => part.replace(/\btype\s+/g, "").trim())
        .filter((part) => part.length > 0)
        .map((part) => part.split(/\s+as\s+/)[0].trim())
    );
  }

  return specifiers;
}

describe("pipeline unused-symbol hygiene", () => {
  it("does not keep unused zkill imports in App paste integration test", async () => {
    const sourceText = await readFile("src/App.paste.integration.test.tsx", "utf8");
    const zkillImportSpecifiers = extractImportSpecifiers(sourceText, "./lib/api/zkill");

    expect(zkillImportSpecifiers).not.toContain("fetchLatestKillsPaged");
    expect(zkillImportSpecifiers).not.toContain("fetchLatestLossesPaged");
  });

  it("does not import unused zkill stats type in breadth pipeline", async () => {
    const sourceText = await readFile("src/lib/pipeline/breadthPipeline.ts", "utf8");
    const zkillImportSpecifiers = extractImportSpecifiers(sourceText, "../api/zkill");

    expect(zkillImportSpecifiers).not.toContain("ZkillCharacterStats");
  });

  it("avoids repeated inline async generic cache stub scaffolding", async () => {
    const sourceText = await readFile("src/lib/pipeline/derivedInference.test.ts", "utf8");
    const inlineGenericPatternCount = (sourceText.match(/async\s*<T>\s*\(\)\s*=>/g) ?? []).length;

    expect(inlineGenericPatternCount).toBe(0);
  });
});
