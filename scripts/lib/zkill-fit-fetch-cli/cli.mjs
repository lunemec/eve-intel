import {
  FetchZkillFitsCliUsageError,
  formatFetchZkillFitsUsage,
  parseFetchZkillFitsArgs
} from "./args.mjs";
import { formatCliRuntimeError, writeCliUsageError } from "../cli-utils.mjs";
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
    if (
      writeCliUsageError({
        error,
        UsageErrorClass: FetchZkillFitsCliUsageError,
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

  try {
    const result = await runPipelineFn(parsed);
    stdout(
      `[fetch-zkill-fits] records=${result.manifest.output.recordsWritten} duplicates=${result.manifest.output.duplicatesSkipped} errors=${result.manifest.output.errorsLogged}`
    );
    return 0;
  } catch (error) {
    stderr(`[fetch-zkill-fits] fatal: ${formatCliRuntimeError(error)}`);
    return 1;
  }
}
