import {
  FetchZkillFitsCliUsageError,
  formatFetchZkillFitsUsage,
  parseFetchZkillFitsArgs
} from "./args.mjs";
import { runFetchZkillFitPipeline } from "./pipeline.mjs";

export async function runFetchZkillFitsCli(argv, dependencies = {}) {
  const parseArgsFn = dependencies.parseArgsFn ?? parseFetchZkillFitsArgs;
  const formatUsageFn = dependencies.formatUsageFn ?? formatFetchZkillFitsUsage;
  const runPipelineFn = dependencies.runPipelineFn ?? runFetchZkillFitPipeline;
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  let parsed;
  try {
    parsed = parseArgsFn(argv);
  } catch (error) {
    if (error instanceof FetchZkillFitsCliUsageError) {
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
    const result = await runPipelineFn(parsed);
    stdout(
      `[fetch-zkill-fits] records=${result.manifest.output.recordsWritten} duplicates=${result.manifest.output.duplicatesSkipped} errors=${result.manifest.output.errorsLogged}`
    );
    return 0;
  } catch (error) {
    stderr(`[fetch-zkill-fits] fatal: ${formatRuntimeError(error)}`);
    return 1;
  }
}

function formatRuntimeError(error) {
  if (!error || typeof error !== "object") {
    return "Unknown error";
  }

  const message = typeof error.message === "string" && error.message.trim() ? error.message : "";
  if (!message) {
    return "Unknown error";
  }

  return message;
}
