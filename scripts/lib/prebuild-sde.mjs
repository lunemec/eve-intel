export const HERMETIC_SDE_BUILD_ENV = "EVE_HERMETIC_BUILD";

const HERMETIC_TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

export function resolveNpmRunInvocation({
  platform = process.platform,
  env = process.env,
  nodeExecPath = process.execPath
} = {}) {
  const npmExecPath =
    env && typeof env === "object" && !Array.isArray(env) && typeof env.npm_execpath === "string"
      ? env.npm_execpath.trim()
      : "";

  if (npmExecPath.length > 0) {
    return {
      command: nodeExecPath,
      args: [npmExecPath, "run"]
    };
  }

  return {
    command: platform === "win32" ? "npm.cmd" : "npm",
    args: ["run"]
  };
}

export function isHermeticSdeBuildEnabled(env = process.env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return false;
  }

  const rawValue = env[HERMETIC_SDE_BUILD_ENV];
  if (typeof rawValue !== "string") {
    return false;
  }

  return HERMETIC_TRUTHY_VALUES.has(rawValue.trim().toLowerCase());
}

export function resolveSdePrebuildScripts(env = process.env) {
  if (isHermeticSdeBuildEnabled(env)) {
    return ["sde:compile"];
  }
  return ["sde:sync", "sde:compile"];
}
