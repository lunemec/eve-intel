import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const DUPLICATE_IMPORT_TARGETS = Object.freeze([
  {
    filePath: "src/lib/usePilotIntelPipelineEffect.ts",
    modulePath: "react"
  },
  {
    filePath: "src/lib/pipeline/executors.ts",
    modulePath: "./constants"
  },
  {
    filePath: "src/lib/pipeline/derivedInference.ts",
    modulePath: "../cache"
  },
  {
    filePath: "src/lib/pipeline/inferenceWindow.ts",
    modulePath: "../api/esi"
  }
]);

function countImportDeclarationsForModule(sourceText, modulePath) {
  const escapedModulePath = modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const importMatches = sourceText.match(
    new RegExp(`^\\s*import[\\s\\S]*?from\\s*["']${escapedModulePath}["']\\s*;?`, "gm")
  );

  return importMatches?.length ?? 0;
}

describe("pipeline duplicate-import hygiene", () => {
  it("does not keep duplicate import declarations in scoped files", async () => {
    const duplicateImportViolations = [];

    for (const target of DUPLICATE_IMPORT_TARGETS) {
      const sourceText = await readFile(target.filePath, "utf8");
      const declarationCount = countImportDeclarationsForModule(sourceText, target.modulePath);

      if (declarationCount > 1) {
        duplicateImportViolations.push(`${target.filePath}:${target.modulePath}:${declarationCount}`);
      }
    }

    expect(duplicateImportViolations).toEqual([]);
  });
});
