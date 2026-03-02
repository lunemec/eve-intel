import {
  DEFAULT_DOGMA_PARITY_FOLLOWUP_BASELINE_SUMMARY_PATH,
  DEFAULT_DOGMA_PARITY_REPORT_PATH,
  runDogmaParityFollowupBaseline
} from "./baseline.mjs";
import {
  assertCliArgvArray,
  formatCliRuntimeError,
  readRequiredCliOptionValue,
  throwUnknownCliArgument,
  writeCliUsageError
} from "../cli-utils.mjs";

export class DogmaParityFollowupBaselineCliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "DogmaParityFollowupBaselineCliUsageError";
  }
}

export function parseDogmaParityFollowupBaselineArgs(argv = []) {
  const args = assertCliArgvArray(argv, DogmaParityFollowupBaselineCliUsageError);

  const parsed = {
    help: false,
    preconditionMet: false,
    parityReportPath: DEFAULT_DOGMA_PARITY_REPORT_PATH,
    summaryPath: DEFAULT_DOGMA_PARITY_FOLLOWUP_BASELINE_SUMMARY_PATH
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    switch (token) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--precondition-met":
        parsed.preconditionMet = true;
        break;
      case "--parity-report-path":
        parsed.parityReportPath = readNextValue(args, token, index + 1);
        index += 1;
        break;
      case "--summary-path":
        parsed.summaryPath = readNextValue(args, token, index + 1);
        index += 1;
        break;
      default:
        throwUnknownCliArgument(token, DogmaParityFollowupBaselineCliUsageError);
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
    if (
      writeCliUsageError({
        error,
        UsageErrorClass: DogmaParityFollowupBaselineCliUsageError,
        stderr,
        formatUsageFn
      })
    ) {
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
    stderr(`[dogma:parity:followup:baseline] fatal: ${formatCliRuntimeError(error)}`);
    return 1;
  }
}

function readNextValue(args, token, nextIndex) {
  return readRequiredCliOptionValue({
    argv: args,
    token,
    nextIndex,
    UsageErrorClass: DogmaParityFollowupBaselineCliUsageError,
    missingValueMessage: `Missing value for ${token}`,
    emptyValueMessage: `Missing value for ${token}`,
    rejectIfFlag: true,
    rejectIfNonString: true
  });
}
