import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const FORBIDDEN_EXPORT_TYPES = Object.freeze([
  "EngineContext",
  "OffenseStageInput",
  "DefenseStageInput"
]);

describe("dogma engine type export hygiene", () => {
  it("does not export unused stage/context types", async () => {
    const sourceText = await readFile("src/lib/dogma/engine/types.ts", "utf8");
    const forbiddenExportedTypes = FORBIDDEN_EXPORT_TYPES.filter((typeName) =>
      new RegExp(`\\bexport\\s+type\\s+${typeName}\\b`).test(sourceText)
    );

    expect(forbiddenExportedTypes).toEqual([]);
  });
});
