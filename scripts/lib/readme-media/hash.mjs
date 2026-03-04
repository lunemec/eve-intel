import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function computeReadmeMediaSourceHash({ repoRoot, sourceFiles }) {
  const hash = createHash("sha256");
  for (const relativePath of sourceFiles) {
    const normalizedPath = String(relativePath).replace(/\\/g, "/");
    const absolutePath = path.join(repoRoot, normalizedPath);
    const content = await readFile(absolutePath, "utf8");
    hash.update(`${normalizedPath}\n`);
    hash.update(content);
    hash.update("\n");
  }
  return hash.digest("hex");
}