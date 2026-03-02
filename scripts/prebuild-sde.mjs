import { execFileSync } from "node:child_process";
import {
  HERMETIC_SDE_BUILD_ENV,
  isHermeticSdeBuildEnabled,
  resolveSdePrebuildScripts
} from "./lib/prebuild-sde.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runNpmScript(scriptName) {
  console.log(`[prebuild] running npm run ${scriptName}`);
  execFileSync(npmCommand, ["run", scriptName], {
    stdio: "inherit",
    env: process.env
  });
}

function main() {
  if (isHermeticSdeBuildEnabled(process.env)) {
    console.log(
      `[prebuild] ${HERMETIC_SDE_BUILD_ENV}=1; skipping network-dependent SDE sync and using local artifacts.`
    );
  }

  for (const scriptName of resolveSdePrebuildScripts(process.env)) {
    runNpmScript(scriptName);
  }
}

try {
  main();
} catch (error) {
  console.error("[prebuild] fatal", error);
  process.exit(1);
}
