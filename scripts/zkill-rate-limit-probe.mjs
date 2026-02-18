#!/usr/bin/env node

import { parseProbeArgs, runProbe } from "../src/lib/dev/zkillRateLimitProbe.ts";

const USAGE =
  "Usage: node scripts/zkill-rate-limit-probe.mjs <url> [--attempts N] [--interval-ms N] [--timeout-ms N] [--stop-on-status 420,429] [--user-agent value]";

async function main(argv = process.argv.slice(2)) {
  const options = parseProbeArgs(argv);
  const exitCode = await runProbe(options);
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(USAGE);
  process.exit(1);
});
