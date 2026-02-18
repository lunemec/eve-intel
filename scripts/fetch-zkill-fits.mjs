#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runFetchZkillFitsCli } from "./lib/zkill-fit-fetch-cli/cli.mjs";

export { runFetchZkillFitsCli };

if (isMainModule(import.meta.url, process.argv[1])) {
  const exitCode = await runFetchZkillFitsCli(process.argv.slice(2));
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function isMainModule(moduleUrl, entryPath) {
  if (!entryPath || typeof entryPath !== "string") {
    return false;
  }
  return moduleUrl === pathToFileURL(entryPath).href;
}
