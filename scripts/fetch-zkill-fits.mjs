#!/usr/bin/env node
import {
  FetchZkillFitsCliUsageError,
  formatFetchZkillFitsUsage,
  parseFetchZkillFitsArgs
} from "./lib/zkill-fit-fetch-cli/args.mjs";

function run(argv) {
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

  throw new Error(
    "Not implemented: fetch pipeline will be added in subsequent tasks after CLI argument contract is validated."
  );
}

const exitCode = run(process.argv.slice(2));
if (exitCode !== 0) {
  process.exit(exitCode);
}
