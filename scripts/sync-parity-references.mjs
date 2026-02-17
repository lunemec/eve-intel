#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runPyfaDocker, shutdownPyfaDockerRuntimes } from "../tools/parity/pyfa-adapter/index.mjs";
import { createHash } from "node:crypto";
import { normalizeEft } from "../tools/parity/pyfa-adapter/normalize-eft.mjs";

const repoRoot = process.cwd();
const corpusPath = path.join(repoRoot, "data", "parity", "fit-corpus.jsonl");
const goldenPath = path.join(repoRoot, "data", "parity", "golden-fit-ids.json");
const referencesPath = path.join(repoRoot, "data", "parity", "reference-results.json");
const manifestPath = path.join(repoRoot, "public", "data", "dogma-manifest.json");
const reportPath = path.join(repoRoot, "reports", "dogma-parity-reference-sync.json");
const unresolvedPath = path.join(repoRoot, "data", "parity", "pyfa-inputs.json");
const tracePath = path.join(repoRoot, "reports", "dogma-parity-reference-trace.jsonl");
const pyfaTimeoutMs = Number(process.env.DOGMA_PARITY_PYFA_TIMEOUT_MS ?? 60_000);
const pyfaHardKillMs = Number(process.env.DOGMA_PARITY_PYFA_HARD_KILL_MS ?? 150_000);
const pyfaMode = process.env.DOGMA_PARITY_PYFA_MODE ?? "direct-cli";
const pyfaDebug = process.env.DOGMA_PARITY_PYFA_DEBUG === "1";

async function main() {
  try {
    const corpus = readJsonl(corpusPath);
    const byFitId = new Map(corpus.map((entry) => [entry.fitId, entry]));

    const goldenFitIds = existsSync(goldenPath) ? JSON.parse(readFileSync(goldenPath, "utf8")) : [];
    const references = existsSync(referencesPath)
      ? JSON.parse(readFileSync(referencesPath, "utf8"))
      : { fits: [] };

    const manifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : { activeVersion: "unknown" };

    const existingById = new Map((references.fits ?? []).map((fit) => [fit.fitId, fit]));

    const added = [];
    const skipped = [];
    const failed = [];

    for (const fitId of goldenFitIds) {
      if (existingById.has(fitId)) {
        skipped.push({ fitId, reason: "already_present" });
        continue;
      }
      const entry = byFitId.get(fitId);
      if (!entry) {
        failed.push({ fitId, reason: "missing_corpus_entry" });
        continue;
      }

      try {
        const normalizedEft = normalizeEft(entry.eft);
        const pyfa = await runPyfaDocker({
          fitId,
          shipTypeId: entry.shipTypeId,
          eft: entry.eft,
          sdeVersion: manifest.activeVersion,
          timeoutMs: pyfaTimeoutMs,
          hardKillMs: pyfaHardKillMs,
          mode: pyfaMode,
          debug: pyfaDebug
        });

        const normalized = {
          fitId,
          shipTypeId: entry.shipTypeId,
          source: "pyfa",
          sdeVersion: manifest.activeVersion,
          dpsTotal: round(pyfa.dpsTotal),
          alpha: round(pyfa.alpha),
          ehp: round(pyfa.ehp),
          resists: pyfa.resists,
          metadata: {
            ...pyfa.metadata,
            referenceMethod: "pyfa-auto",
            origin: entry.origin,
            tags: (entry.tags ?? []).join(",")
          }
        };

        existingById.set(fitId, normalized);
        added.push({ fitId, source: "pyfa" });
      } catch (error) {
        const details = error?.details ?? {};
        failed.push({
          fitId,
          reason: "pyfa_failed",
          error: String(error?.message ?? error),
          mode: details.mode ?? pyfaMode,
          timeoutMs: details.timeoutMs ?? pyfaTimeoutMs,
          hardKillMs: details.hardKillMs ?? pyfaHardKillMs,
          stage: details.stage ?? "runtime_error",
          elapsedMs: details.elapsedMs ?? 0,
          stdoutTail: details.stdoutTail ?? "",
          stderrTail: details.stderrTail ?? "",
          normalizedEftHash:
            details.normalizedEftHash ?? sha256(normalizeEft(entry.eft).normalized)
        });
      }
    }

    const nextFits = [...existingById.values()].sort((a, b) => String(a.fitId).localeCompare(String(b.fitId)));
    writeFileSync(referencesPath, `${JSON.stringify({ fits: nextFits }, null, 2)}\n`, "utf8");

    const report = {
      generatedAt: new Date().toISOString(),
      goldenCount: goldenFitIds.length,
      existingBefore: (references.fits ?? []).length,
      existingAfter: nextFits.length,
      mode: pyfaMode,
      timeoutMs: pyfaTimeoutMs,
      hardKillMs: pyfaHardKillMs,
      tracePath: pyfaDebug ? path.relative(repoRoot, tracePath) : null,
      added,
      skipped,
      failed
    };
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(`[dogma:parity:refs] added=${added.length} skipped=${skipped.length} failed=${failed.length}`);
    if (failed.length > 0) {
      console.log(`[dogma:parity:refs] unresolved fitIds: ${failed.map((row) => row.fitId).join(", ")}`);
    }

    const unresolved = goldenFitIds
      .filter((fitId) => !nextFits.some((fit) => fit.fitId === fitId))
      .map((fitId) => byFitId.get(fitId))
      .filter(Boolean)
      .map((row) => {
        const normalized = normalizeEft(row.eft);
        return {
          fitId: row.fitId,
          shipTypeId: row.shipTypeId,
          eft: normalized.normalized,
          shipName: normalized.shipName,
          tags: row.tags ?? [],
          origin: row.origin,
          normalizedEftHash: sha256(normalized.normalized)
        };
      });
    writeFileSync(
      unresolvedPath,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), count: unresolved.length, fits: unresolved }, null, 2)}\n`,
      "utf8"
    );
  } finally {
    await shutdownPyfaDockerRuntimes();
  }
}

function readJsonl(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function round(value) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(4));
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

main().catch((error) => {
  console.error("[dogma:parity:refs] fatal", error);
  process.exit(1);
});
