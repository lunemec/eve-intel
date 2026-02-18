#!/usr/bin/env node
import {
  FetchZkillFitsCliUsageError,
  formatFetchZkillFitsUsage,
  parseFetchZkillFitsArgs
} from "./lib/zkill-fit-fetch-cli/args.mjs";
import { runFetchZkillFitPipeline } from "./lib/zkill-fit-fetch-cli/pipeline.mjs";

export async function runFetchZkillFitsCli(argv) {
  let parsed;
  try {
    parsed = parseFetchZkillFitsArgs(argv);
  } catch (error) {
    if (error instanceof FetchZkillFitsCliUsageError) {
      console.error(error.message);
      console.error("");
      console.error(formatFetchZkillFitsUsage());
      return 2;
    }
    throw error;
  }

  if (parsed.help) {
    console.log(formatFetchZkillFitsUsage());
    return 0;
  }

  try {
    const result = await runFetchZkillFitPipeline(parsed);
    console.log(
      `[fetch-zkill-fits] records=${result.manifest.output.recordsWritten} duplicates=${result.manifest.output.duplicatesSkipped} errors=${result.manifest.output.errorsLogged}`
    );
    return 0;
  } catch (error) {
    console.error(`[fetch-zkill-fits] fatal: ${formatRuntimeError(error)}`);
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

const exitCode = await runFetchZkillFitsCli(process.argv.slice(2));
if (exitCode !== 0) {
  process.exit(exitCode);
}
