import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = "scripts/backtest-zkill.mjs";

const REQUIRED_SNIPPETS = Object.freeze([
  'from "../src/lib/backtestCore.ts"',
  "runBacktestCandidateScoring",
  "predictShipIdsByRecency",
  "DEFAULT_RECENCY_BACKTEST_CANDIDATES"
]);

const FORBIDDEN_LOCAL_IMPL_SNIPPETS = Object.freeze([
  "const candidateWeights = [",
  "function newestObservedShip(",
  "function predictShipIds("
]);

describe("backtest zkill canonicalization", () => {
  it("keeps scripts/backtest-zkill.mjs delegated to shared backtest core", async () => {
    const sourceText = await readFile(SCRIPT_PATH, "utf8");

    const missingRequiredSnippets = REQUIRED_SNIPPETS.filter((snippet) => !sourceText.includes(snippet));
    const forbiddenSnippetsPresent = FORBIDDEN_LOCAL_IMPL_SNIPPETS.filter((snippet) => sourceText.includes(snippet));

    expect(missingRequiredSnippets).toEqual([]);
    expect(forbiddenSnippetsPresent).toEqual([]);
  });
});
