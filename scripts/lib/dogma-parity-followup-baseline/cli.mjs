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
    preconditionMet: false
  };

  for (const token of argv) {
    switch (token) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--precondition-met":
        parsed.preconditionMet = true;
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
    "  --precondition-met    Confirm prerequisite Ralph task is completed/merged"
  ].join("\n");
}

export async function runDogmaParityFollowupBaselineCli(argv = [], dependencies = {}) {
  const parseArgsFn = dependencies.parseArgsFn ?? parseDogmaParityFollowupBaselineArgs;
  const formatUsageFn =
    dependencies.formatUsageFn ?? formatDogmaParityFollowupBaselineUsage;
  const runBaselineFn = dependencies.runBaselineFn ?? createMissingRunBaselineHandler();
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
    await runBaselineFn(parsed);
    stdout("[dogma:parity:followup:baseline] baseline run complete.");
    return 0;
  } catch (error) {
    stderr(`[dogma:parity:followup:baseline] fatal: ${formatRuntimeError(error)}`);
    return 1;
  }
}

function createMissingRunBaselineHandler() {
  return async () => {
    throw new Error("runBaselineFn dependency is required until baseline generation is wired.");
  };
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
