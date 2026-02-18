#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runDogmaParityNewFitsCli } from "./lib/dogma-parity-new-fits/cli.mjs";

export { runDogmaParityNewFitsCli };

if (isMainModule(import.meta.url, process.argv[1])) {
  const exitCode = await runDogmaParityNewFitsCli(process.argv.slice(2));
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
