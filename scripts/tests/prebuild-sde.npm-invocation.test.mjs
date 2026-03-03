import { describe, expect, it } from "vitest";
import { resolveNpmRunInvocation } from "../lib/prebuild-sde.mjs";

describe("resolveNpmRunInvocation", () => {
  it("uses npm cli entrypoint via node executable when npm_execpath is available on Windows", () => {
    const invocation = resolveNpmRunInvocation({
      platform: "win32",
      env: {
        npm_execpath: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"
      }
    });

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args).toEqual([
      "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
      "run"
    ]);
  });

  it("falls back to npm command when npm_execpath is unavailable", () => {
    const invocation = resolveNpmRunInvocation({
      platform: "darwin",
      env: {}
    });

    expect(invocation.command).toBe("npm");
    expect(invocation.args).toEqual(["run"]);
  });
});
