#!/usr/bin/env node
import { runDogmaParityFollowupBaselineCli } from "./lib/dogma-parity-followup-baseline/cli.mjs";

runDogmaParityFollowupBaselineCli(process.argv.slice(2))
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    const message =
      typeof error?.message === "string" && error.message.trim().length > 0
        ? error.message.trim()
        : "Unknown error";
    console.error(`[dogma:parity:followup:baseline] fatal: ${message}`);
    process.exit(1);
  });
