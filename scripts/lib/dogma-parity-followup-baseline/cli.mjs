import {
  DEFAULT_DOGMA_PARITY_FOLLOWUP_BASELINE_SUMMARY_PATH,
  DEFAULT_DOGMA_PARITY_REPORT_PATH,
  runDogmaParityFollowupBaseline
} from "./baseline.mjs";

export class DogmaParityFollowupBaselineCliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "DogmaParityFollowupBaselineCliUsageError";
  }
}

export function parseDogmaParityFollowupBaselineArgs(argv = []) {
  if (!Array.isArray(argv)) {
    throw new DogmaParityFollowupBaselineCliUsageError(
      "CLI arguments must be provided as an array."
    );
  }

  const parsed = {
    help: false,
    preconditionMet: false,
    parityReportPath: DEFAULT_DOGMA_PARITY_REPORT_PATH,
    summaryPath: DEFAULT_DOGMA_PARITY_FOLLOWUP_BASELINE_SUMMARY_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--precondition-met":
        parsed.preconditionMet = true;
        break;
      case "--parity-report-path":
        parsed.parityReportPath = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      case "--summary-path":
        parsed.summaryPath = readNextValue(argv, token, index + 1);
        index += 1;
        break;
      default:
        throw new DogmaParityFollowupBaselineCliUsageError(`Unknown argument: ${token}`);
    }
  }

  return parsed;
}

export function formatDogmaParityFollowupBaselineUsage() {
  return [
    "Usage: node scripts/run-dogma-parity-followup-baseline.mjs [options]",
    "",
    "Options:",
    "  --help, -h            Show this help text",
    "  --precondition-met    Confirm prerequisite Ralph task is completed/merged",
    "  --parity-report-path  Input parity report path (default: reports/dogma-parity-report.json)",
    "  --summary-path        Output summary artifact path (default: reports/dogma-parity-followup-baseline-summary.json)"
  ].join("\n");
}

export async function runDogmaParityFollowupBaselineCli(argv = [], dependencies = {}) {
  const parseArgsFn = dependencies.parseArgsFn ?? parseDogmaParityFollowupBaselineArgs;
  const formatUsageFn =
    dependencies.formatUsageFn ?? formatDogmaParityFollowupBaselineUsage;
  const runBaselineFn = dependencies.runBaselineFn ?? runDogmaParityFollowupBaseline;
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  let parsed;
  try {
    parsed = parseArgsFn(argv);
  } catch (error) {
    if (error instanceof DogmaParityFollowupBaselineCliUsageError) {
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

  if (!parsed.preconditionMet) {
    stderr(
      "[dogma:parity:followup:baseline] entry gate failed: current Ralph task is not marked completed/merged. Re-run with --precondition-met once the prerequisite task is merged."
    );
    return 2;
  }

  try {
    await runBaselineFn({
      parityReportPath: parsed.parityReportPath,
      summaryPath: parsed.summaryPath
    });
    stdout("[dogma:parity:followup:baseline] baseline run complete.");
    return 0;
  } catch (error) {
    stderr(`[dogma:parity:followup:baseline] fatal: ${formatRuntimeError(error)}`);
    return 1;
  }
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

function readNextValue(argv, token, nextIndex) {
  const value = argv[nextIndex];
  if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
    throw new DogmaParityFollowupBaselineCliUsageError(
      `Missing value for ${token}`
    );
  }
  return value;
}
