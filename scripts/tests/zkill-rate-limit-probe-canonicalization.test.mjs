import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = "scripts/zkill-rate-limit-probe.mjs";

const REQUIRED_SNIPPETS = Object.freeze([
  'from "../src/lib/dev/zkillRateLimitProbe.ts"',
  "parseProbeArgs",
  "runProbe"
]);

const FORBIDDEN_LOCAL_IMPL_SNIPPETS = Object.freeze([
  "const DEFAULTS =",
  "function parseArgs(",
  "function deriveRetryHints(",
  "function fetchWithTimeout(",
  "function parseRetryAfterMs(",
  "function parseResetMs("
]);

describe("zkill rate-limit probe canonicalization", () => {
  it("keeps scripts/zkill-rate-limit-probe.mjs as a thin wrapper", async () => {
    const sourceText = await readFile(SCRIPT_PATH, "utf8");

    const missingRequiredSnippets = REQUIRED_SNIPPETS.filter((snippet) => !sourceText.includes(snippet));
    const forbiddenSnippetsPresent = FORBIDDEN_LOCAL_IMPL_SNIPPETS.filter((snippet) => sourceText.includes(snippet));

    expect(missingRequiredSnippets).toEqual([]);
    expect(forbiddenSnippetsPresent).toEqual([]);
  });
});
