import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const FORBIDDEN_EXPORTS = Object.freeze([
  {
    filePath: "src/lib/dogma/loader.ts",
    symbolName: "getDogmaVersion"
  },
  {
    filePath: "src/lib/dogma/index.ts",
    symbolName: "getAttr"
  },
  {
    filePath: "src/lib/pipeline/snapshotCache.ts",
    symbolName: "buildPilotSnapshotKey"
  }
]);

function isFunctionExported(sourceText, symbolName) {
  return new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${symbolName}\\b`).test(sourceText);
}

describe("dogma/pipeline dead-export hygiene", () => {
  it("does not export scoped dead-surface symbols", async () => {
    const forbiddenExportedSymbols = [];

    for (const target of FORBIDDEN_EXPORTS) {
      const sourceText = await readFile(target.filePath, "utf8");
      if (isFunctionExported(sourceText, target.symbolName)) {
        forbiddenExportedSymbols.push(`${target.filePath}:${target.symbolName}`);
      }
    }

    expect(forbiddenExportedSymbols).toEqual([]);
  });
});
