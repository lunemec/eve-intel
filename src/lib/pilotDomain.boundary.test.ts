import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PILOT_CARD_HOOK_IMPORT_PATTERN =
  /import\s+type\s+\{\s*PilotCard\s*\}\s+from\s+["'][^"']*usePilotIntelPipeline["']/;

function collectSourceFiles(rootDir: string): string[] {
  const files: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) {
      continue;
    }
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(absolutePath);
      }
    }
  }

  return files;
}

describe("pilot domain boundary", () => {
  it("keeps PilotCard contract imports out of usePilotIntelPipeline module boundary", () => {
    const srcRoot = fileURLToPath(new URL("../", import.meta.url));
    const files = collectSourceFiles(srcRoot);
    const offenders = files
      .filter((filePath) => !filePath.endsWith("usePilotIntelPipeline.ts"))
      .filter((filePath) => PILOT_CARD_HOOK_IMPORT_PATTERN.test(readFileSync(filePath, "utf8")))
      .map((filePath) => filePath.replace(`${srcRoot}`, "src/"));

    expect(
      offenders,
      `Move PilotCard type imports to shared pilot-domain contracts:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
