import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { normalizeEft } from "./normalize-eft.mjs";

export const DEFAULT_PYFA_IMAGE =
  process.env.PYFA_DOCKER_IMAGE ?? "molbal/svcfitstat@sha256:946df76cbd4fa7cce496e3f56c11dc94499ed2a3eade750ab37c24254c2791af";
const DEFAULT_MODE = process.env.DOGMA_PARITY_PYFA_MODE ?? "direct-cli";
const DEFAULT_TIMEOUT_MS = Number(process.env.DOGMA_PARITY_PYFA_TIMEOUT_MS ?? 120_000);
const DEFAULT_HARD_KILL_MS = Number(process.env.DOGMA_PARITY_PYFA_HARD_KILL_MS ?? 150_000);
const TRACE_PATH = path.join(process.cwd(), "reports", "dogma-parity-reference-trace.jsonl");

export async function runPyfaDocker(params) {
  const normalized = normalizeEft(params.eft);
  const image = params.image ?? DEFAULT_PYFA_IMAGE;
  const mode = normalizeMode(params.mode ?? DEFAULT_MODE);
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const hardKillMs = params.hardKillMs ?? DEFAULT_HARD_KILL_MS;
  const debug = Boolean(params.debug ?? process.env.DOGMA_PARITY_PYFA_DEBUG === "1");
  const diagBase = {
    fitId: params.fitId,
    shipTypeId: params.shipTypeId,
    image,
    mode,
    timeoutMs,
    hardKillMs,
    normalizedEftHash: sha256(normalized.normalized),
    stage: "container_start"
  };
  const startedAt = Date.now();

  try {
    let output;
    if (mode === "web") {
      output = await runSvcfitstatWeb(image, normalized.normalized, timeoutMs, hardKillMs);
    } else {
      output = await runSvcfitstatDirectCli(image, normalized.normalized, timeoutMs, hardKillMs);
    }
    const parsed = parsePyfaOutput(
      output.stdout,
      params.fitId,
      params.shipTypeId,
      params.sdeVersion ?? "unknown",
      image
    );
    parsed.metadata = {
      ...parsed.metadata,
      pyfaMode: mode,
      pyfaVersion: inferPyfaVersion(output.stdout)
    };
    if (debug) {
      writeTrace({
        ...diagBase,
        ok: true,
        stage: "parse",
        elapsedMs: Date.now() - startedAt,
        stdoutTail: tail(output.stdout, 600),
        stderrTail: tail(output.stderr, 600)
      });
    }
    return parsed;
  } catch (error) {
    const wrapped = ensurePyfaError(error, {
      ...diagBase,
      elapsedMs: Date.now() - startedAt
    });
    if (debug) {
      writeTrace({
        ...wrapped.details,
        ok: false
      });
    }
    throw wrapped;
  }
}

export async function shutdownPyfaDockerRuntimes() {
  return;
}

export function parsePyfaOutput(stdout, fitId, shipTypeId, sdeVersion, image = "unknown") {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    const extracted = extractJsonTail(stdout);
    try {
      parsed = JSON.parse(extracted);
    } catch {
      throw new Error(`pyfa output is not valid JSON: ${String(error)}`);
    }
  }

  const stats = unwrapSvcfitstatEnvelope(parsed);
  const resists = stats?.defense?.resists;
  return {
    fitId,
    shipTypeId,
    source: "pyfa",
    sdeVersion,
    dpsTotal: Number(stats?.offense?.totalDps ?? 0),
    alpha: Number(stats?.offense?.totalVolley ?? 0),
    ehp: Number(stats?.defense?.ehp?.total ?? 0),
    resists: {
      shield: {
        em: Number(resists?.shield?.em ?? 0),
        therm: Number(resists?.shield?.therm ?? 0),
        kin: Number(resists?.shield?.kin ?? 0),
        exp: Number(resists?.shield?.exp ?? 0)
      },
      armor: {
        em: Number(resists?.armor?.em ?? 0),
        therm: Number(resists?.armor?.therm ?? 0),
        kin: Number(resists?.armor?.kin ?? 0),
        exp: Number(resists?.armor?.exp ?? 0)
      },
      hull: {
        em: Number(resists?.hull?.em ?? 0),
        therm: Number(resists?.hull?.therm ?? 0),
        kin: Number(resists?.hull?.kin ?? 0),
        exp: Number(resists?.hull?.exp ?? 0)
      }
    },
    metadata: {
      image,
      envelope: parsed?.stats ? "svcfitstat" : "raw"
    }
  };
}

function unwrapSvcfitstatEnvelope(parsed) {
  if (parsed && typeof parsed === "object" && parsed.stats) {
    if (parsed.success === false) {
      throw new Error(`pyfa svcfitstat response failed: ${parsed.errorText ?? "unknown error"}`);
    }
    return parsed.stats;
  }
  return parsed;
}

async function runSvcfitstatDirectCli(image, eft, timeoutMs, hardKillMs) {
  const fitB64 = Buffer.from(eft, "utf8").toString("base64");
  const shellCommand = `xvfb-run python3.6 /pyfa/pyfa.py -r -l Critical -f ${fitB64}`;
  const create = await runCommand(
    "docker",
    ["run", "--detach", "--entrypoint", "/bin/sh", image, "-lc", shellCommand],
    { timeoutMs: Math.min(30_000, timeoutMs), hardKillMs: Math.min(45_000, hardKillMs) }
  );
  const containerId = create.stdout.trim();

  try {
    await runCommand("docker", ["wait", containerId], { timeoutMs, hardKillMs });
    const logs = await runCommand("docker", ["logs", containerId], {
      timeoutMs: 20_000,
      hardKillMs: 25_000,
      allowNonZeroExit: true
    });
    return {
      stdout: extractJsonTail(logs.stdout),
      stderr: logs.stderr
    };
  } catch (error) {
    try {
      const logs = await runCommand("docker", ["logs", containerId], {
        timeoutMs: 8_000,
        hardKillMs: 10_000,
        allowNonZeroExit: true
      });
      if (error?.details) {
        error.details.stdoutTail = tail(logs.stdout, 600);
        error.details.stderrTail = tail(logs.stderr, 600);
      }
    } catch {}
    throw error;
  } finally {
    await runCommand("docker", ["stop", containerId], {
      timeoutMs: 10_000,
      hardKillMs: 12_000,
      allowNonZeroExit: true
    });
    await runCommand("docker", ["rm", "-f", containerId], {
      timeoutMs: 10_000,
      hardKillMs: 12_000,
      allowNonZeroExit: true
    });
  }
}

async function runSvcfitstatWeb(image, eft, timeoutMs, hardKillMs) {
  const secret = "dogma-parity";
  const container = await runCommand(
    "docker",
    [
      "run",
      "--rm",
      "--detach",
      "--publish",
      "127.0.0.1::80",
      "--env",
      `SFS_SECRET=${secret}`,
      "--env",
      "SFS_FIT_MAX_LENGTH=10000",
      image
    ],
    { timeoutMs: Math.min(30_000, timeoutMs), hardKillMs: Math.min(45_000, hardKillMs) }
  );
  const containerId = container.stdout.trim();
  const port = await resolveMappedPort(containerId);

  try {
    await waitForWebReady(port, Math.min(20_000, timeoutMs));
    const body = new URLSearchParams({ fit: eft, secret });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/index.php`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal
      });
      const stdout = await response.text();
      if (!response.ok) {
        throw new PyfaExecError(`svcfitstat HTTP ${response.status}`, {
          stage: "request",
          stdoutTail: tail(stdout, 600),
          stderrTail: "",
          mode: "web"
        });
      }
      return { stdout, stderr: "" };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new PyfaExecError("pyfa request timed out", {
          stage: "timeout",
          stdoutTail: "",
          stderrTail: "",
          mode: "web"
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await runCommand("docker", ["stop", containerId], {
      timeoutMs: 10_000,
      hardKillMs: 12_000,
      allowNonZeroExit: true
    });
  }
}

async function resolveMappedPort(containerId) {
  const inspection = await runCommand("docker", ["port", containerId, "80/tcp"], {
    timeoutMs: 10_000,
    hardKillMs: 12_000
  });
  const line = inspection.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
  const m = line.match(/:(\d+)$/);
  if (!m) {
    throw new PyfaExecError(`Failed to resolve mapped port from docker output: ${line}`, {
      stage: "container_start",
      mode: "web"
    });
  }
  return Number(m[1]);
}

async function waitForWebReady(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/index.php`);
      if (response.status >= 400 && response.status < 500) {
        return;
      }
    } catch {}
    await sleep(200);
  }
  throw new PyfaExecError("svcfitstat web worker did not become ready", {
    stage: "container_start",
    mode: "web"
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMode(mode) {
  return mode === "web" ? "web" : "direct-cli";
}

function tail(value, limit) {
  if (!value) return "";
  return value.length <= limit ? value : value.slice(-limit);
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function writeTrace(entry) {
  mkdirSync(path.dirname(TRACE_PATH), { recursive: true });
  appendFileSync(TRACE_PATH, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
}

function extractJsonTail(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) return stdout;
  return stdout.slice(start);
}

function inferPyfaVersion(stdout) {
  const m = stdout.match(/"ship":\s*\{"id":/);
  return m ? "svcfitstat-worker" : undefined;
}

function ensurePyfaError(error, baseDetails) {
  if (error instanceof PyfaExecError) {
    error.details = { ...baseDetails, ...error.details };
    return error;
  }
  const wrapped = new PyfaExecError(String(error?.message ?? error), {
    ...baseDetails,
    stage: "runtime_error"
  });
  return wrapped;
}

class PyfaExecError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "PyfaExecError";
    this.details = details ?? {};
  }
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let hardKilled = false;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const hardKillMs = Math.max(timeoutMs, options.hardKillMs ?? DEFAULT_HARD_KILL_MS);
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    const hardKillTimer = setTimeout(() => {
      hardKilled = true;
      child.kill("SIGKILL");
    }, hardKillMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeoutTimer);
      clearTimeout(hardKillTimer);
      reject(
        new PyfaExecError(String(error?.message ?? error), {
          stage: "runtime_error",
          stdoutTail: tail(stdout, 600),
          stderrTail: tail(stderr, 600)
        })
      );
    });
    child.on("close", (code) => {
      clearTimeout(timeoutTimer);
      clearTimeout(hardKillTimer);
      if (timedOut || hardKilled) {
        reject(
          new PyfaExecError("pyfa command timed out", {
            stage: "timeout",
            stdoutTail: tail(stdout, 600),
            stderrTail: tail(stderr, 600)
          })
        );
        return;
      }
      if (code !== 0 && !options.allowNonZeroExit) {
        reject(
          new PyfaExecError(`command failed with exit code ${code}`, {
            stage: "runtime_error",
            stdoutTail: tail(stdout, 600),
            stderrTail: tail(stderr, 600)
          })
        );
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}
