import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { shutdownPyfaLocalRuntimes } from "../../../tools/parity/pyfa-adapter/index.mjs";
import { compareDogmaParityForScope } from "./compare.mjs";
import { resolveDogmaNewFitScope } from "./scope.mjs";
import { syncDogmaParityReferencesForScope } from "./sync.mjs";

const DEFAULT_CORPUS_PATH = path.join("data", "parity", "fit-corpus.jsonl");
const DEFAULT_REFERENCES_PATH = path.join("data", "parity", "reference-results.json");
const DEFAULT_MANIFEST_PATH = path.join("public", "data", "dogma-manifest.json");

export class DogmaParityNewFitsCliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "DogmaParityNewFitsCliUsageError";
  }
}

export function parseDogmaParityNewFitsArgs(argv = []) {
  if (!Array.isArray(argv)) {
    throw new DogmaParityNewFitsCliUsageError("CLI arguments must be provided as an array.");
  }

  const parsed = {
    help: false,
    mode: "sample",
    scopeFilePath: undefined,
    fitIdFlags: [],
    runId: undefined,
    generatedAt: undefined,
    source: undefined,
    corpusPath: DEFAULT_CORPUS_PATH,
    referencesPath: DEFAULT_REFERENCES_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    pythonBin: undefined,
    timeoutMs: undefined,
    hardKillMs: undefined,
    debug: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--mode":
        parsed.mode = parseMode(readNextValue(argv, token, index + 1));
        index += 1;
        break;
      case "--scope-file":
        parsed.scopeFilePath = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      case "--fit-id":
      case "--fit-ids":
        parsed.fitIdFlags.push(readNextValue(argv, token, index + 1));
        index += 1;
        break;
      case "--run-id":
        parsed.runId = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      case "--generated-at":
        parsed.generatedAt = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      case "--source":
        parsed.source = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      case "--corpus-path":
        parsed.corpusPath = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      case "--references-path":
        parsed.referencesPath = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      case "--manifest-path":
        parsed.manifestPath = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      case "--python-bin":
        parsed.pythonBin = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      case "--timeout-ms":
        parsed.timeoutMs = parseIntegerArgument({
          token,
          value: readNextValue(argv, token, index + 1)
        });
        index += 1;
        break;
      case "--hard-kill-ms":
        parsed.hardKillMs = parseIntegerArgument({
          token,
          value: readNextValue(argv, token, index + 1)
        });
        index += 1;
        break;
      case "--debug":
        parsed.debug = true;
        break;
      default:
        throw new DogmaParityNewFitsCliUsageError(`Unknown argument: ${token}`);
    }
  }

  return parsed;
}

export function formatDogmaParityNewFitsUsage() {
  return [
    "Usage: node scripts/run-dogma-parity-new-fits.mjs [options]",
    "",
    "Options:",
    "  --help, -h               Show this help text",
    "  --mode <sample|ci>       Comparison threshold mode (default: sample)",
    "  --scope-file <path>      JSON scope payload path",
    "  --fit-id <id>            Scoped fit id (repeatable)",
    "  --fit-ids <csv>          Scoped fit ids as comma-separated list",
    "  --run-id <id>            Override scope runId",
    "  --generated-at <iso>     Override scope generatedAt timestamp",
    "  --source <name>          Override scope source",
    "  --corpus-path <path>     Override fit corpus path",
    "  --references-path <path> Override reference results path",
    "  --manifest-path <path>   Override dogma manifest path",
    "  --python-bin <path>      Python binary for pyfa local runner",
    "  --timeout-ms <ms>        pyfa timeout in milliseconds",
    "  --hard-kill-ms <ms>      pyfa hard-kill timeout in milliseconds",
    "  --debug                  Enable pyfa debug mode"
  ].join("\n");
}

export async function runDogmaParityNewFitsCli(argv, dependencies = {}) {
  const parseArgsFn = dependencies.parseArgsFn ?? parseDogmaParityNewFitsArgs;
  const formatUsageFn = dependencies.formatUsageFn ?? formatDogmaParityNewFitsUsage;
  const resolveScopeFn = dependencies.resolveScopeFn ?? resolveDogmaNewFitScope;
  const readCorpusEntriesFn = dependencies.readCorpusEntriesFn ?? readDogmaParityCorpusEntries;
  const readReferenceResultsFn =
    dependencies.readReferenceResultsFn ?? readDogmaParityReferenceResults;
  const readDogmaManifestFn = dependencies.readDogmaManifestFn ?? readDogmaManifest;
  const syncReferencesFn =
    dependencies.syncReferencesFn ?? syncDogmaParityReferencesForScope;
  const compareScopeFn = dependencies.compareScopeFn ?? compareDogmaParityForScope;
  const writeReferenceResultsFn =
    dependencies.writeReferenceResultsFn ?? writeDogmaParityReferenceResults;
  const computeActualForFitFn =
    dependencies.computeActualForFitFn ?? createMissingComputeActualForFitHandler();
  const shutdownPyfaFn = dependencies.shutdownPyfaFn ?? shutdownPyfaLocalRuntimes;
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  let parsed;
  try {
    parsed = parseArgsFn(argv);
  } catch (error) {
    if (error instanceof DogmaParityNewFitsCliUsageError) {
      stderr(error.message);
      stderr("");
      stderr(formatUsageFn());
      return 2;
    }
    throw error;
  }

  if (parsed.help) {
    stdout(formatUsageFn());
    return 0;
  }

  try {
    const scope = await resolveScopeFn({
      scopeFilePath: parsed.scopeFilePath,
      fitIdFlags: parsed.fitIdFlags,
      runId: parsed.runId,
      generatedAt: parsed.generatedAt,
      source: parsed.source
    });

    const [corpusEntries, referenceResults, manifest] = await Promise.all([
      readCorpusEntriesFn(parsed.corpusPath),
      readReferenceResultsFn(parsed.referencesPath),
      readDogmaManifestFn(parsed.manifestPath)
    ]);

    const syncResult = await syncReferencesFn({
      newFitIds: scope.newFitIds,
      corpusEntries,
      referenceFits: referenceResults.fits,
      sdeVersion: manifest.activeVersion,
      pythonBin: parsed.pythonBin,
      timeoutMs: parsed.timeoutMs,
      hardKillMs: parsed.hardKillMs,
      debug: parsed.debug
    });

    await writeReferenceResultsFn(
      {
        fits: syncResult.mergedReferenceFits
      },
      parsed.referencesPath
    );

    const compareResult = await compareScopeFn({
      newFitIds: scope.newFitIds,
      corpusEntries,
      referenceFits: syncResult.mergedReferenceFits,
      mode: parsed.mode,
      computeActualForFit: computeActualForFitFn
    });

    const exitCode = resolveDogmaNewFitsExitCode({
      mismatchCount: compareResult.mismatchCount
    });

    stdout(
      `[dogma:parity:new-fits] runId=${scope.runId} scoped=${scope.newFitIds.length} compared=${compareResult.comparedFitCount} mismatches=${compareResult.mismatchCount} pyfaFailures=${syncResult.pyfaFailureCount}`
    );

    return exitCode;
  } catch (error) {
    stderr(`[dogma:parity:new-fits] fatal: ${formatRuntimeError(error)}`);
    return 1;
  } finally {
    await shutdownSafely(shutdownPyfaFn, stderr);
  }
}

export function resolveDogmaNewFitsExitCode({ mismatchCount }) {
  return Number(mismatchCount) > 0 ? 1 : 0;
}

async function readDogmaParityCorpusEntries(corpusPath = DEFAULT_CORPUS_PATH) {
  const resolvedPath = resolveFromRepoRoot(corpusPath);
  if (!existsSync(resolvedPath)) {
    return [];
  }

  const raw = await readFile(resolvedPath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readDogmaParityReferenceResults(referencesPath = DEFAULT_REFERENCES_PATH) {
  const resolvedPath = resolveFromRepoRoot(referencesPath);
  if (!existsSync(resolvedPath)) {
    return { fits: [] };
  }

  const raw = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Reference results file must contain a JSON object.");
  }
  const fits = Array.isArray(parsed.fits) ? parsed.fits : [];
  return { fits };
}

async function writeDogmaParityReferenceResults(
  referenceResults,
  referencesPath = DEFAULT_REFERENCES_PATH
) {
  const resolvedPath = resolveFromRepoRoot(referencesPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(referenceResults, null, 2)}\n`, "utf8");
}

async function readDogmaManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  const resolvedPath = resolveFromRepoRoot(manifestPath);
  if (!existsSync(resolvedPath)) {
    return { activeVersion: "unknown" };
  }
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  const activeVersion =
    typeof parsed?.activeVersion === "string" && parsed.activeVersion.trim().length > 0
      ? parsed.activeVersion.trim()
      : "unknown";
  return { activeVersion };
}

function resolveFromRepoRoot(inputPath) {
  if (typeof inputPath !== "string" || inputPath.trim().length === 0) {
    throw new TypeError("Expected path to be a non-empty string.");
  }
  return path.resolve(process.cwd(), inputPath);
}

function createMissingComputeActualForFitHandler() {
  return async () => {
    throw new Error(
      "computeActualForFitFn dependency is required until Dogma runtime binding is wired."
    );
  };
}

function parseMode(rawMode) {
  const mode = String(rawMode ?? "").trim().toLowerCase();
  if (mode === "sample" || mode === "ci") {
    return mode;
  }
  throw new DogmaParityNewFitsCliUsageError(
    `Invalid --mode value: ${String(rawMode ?? "")}. Expected sample or ci.`
  );
}

function parseIntegerArgument({ token, value }) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new DogmaParityNewFitsCliUsageError(`${token} must be a non-negative number.`);
  }
  return Math.trunc(numeric);
}

function readNextValue(argv, token, nextIndex) {
  const value = argv[nextIndex];
  if (value === undefined) {
    throw new DogmaParityNewFitsCliUsageError(`${token} requires a value.`);
  }
  if (String(value).trim().length === 0) {
    throw new DogmaParityNewFitsCliUsageError(`${token} requires a non-empty value.`);
  }
  return String(value);
}

function formatRuntimeError(error) {
  if (!error || typeof error !== "object") {
    return "Unknown error";
  }
  const message =
    typeof error.message === "string" && error.message.trim().length > 0
      ? error.message.trim()
      : "";
  return message || "Unknown error";
}

async function shutdownSafely(shutdownPyfaFn, stderr) {
  try {
    await shutdownPyfaFn();
  } catch (error) {
    stderr(`[dogma:parity:new-fits] fatal: ${formatRuntimeError(error)}`);
  }
}
