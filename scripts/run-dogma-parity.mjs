#!/usr/bin/env node
import { spawn } from "node:child_process";

const mode = process.argv[2] === "ci" ? "ci" : "sample";

const steps =
  mode === "ci"
    ? [
        ["run", "-s", "dogma:parity:check"],
        ["run", "-s", "test", "--", "src/lib/dogma/parity/parity.test.ts"]
      ]
    : [["run", "-s", "test", "--", "src/lib/dogma/parity/parity.test.ts"]];

runSequentially(steps, {
  ...process.env,
  DOGMA_PARITY_MODE: mode
}).then((code) => process.exit(code));

async function runSequentially(steps, env) {
  for (const args of steps) {
    const code = await runOne(args, env);
    if (code !== 0) return code;
  }
  return 0;
}

function runOne(args, env) {
  return new Promise((resolve) => {
    const child = spawn("npm", args, {
      stdio: "inherit",
      env
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
