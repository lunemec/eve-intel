import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { normalizeEft } from "./normalize-eft.mjs";

const DEFAULT_TIMEOUT_MS = Number(process.env.DOGMA_PARITY_PYFA_TIMEOUT_MS ?? 120_000);
const DEFAULT_HARD_KILL_MS = Number(process.env.DOGMA_PARITY_PYFA_HARD_KILL_MS ?? 150_000);
const TRACE_PATH = path.join(process.cwd(), "reports", "dogma-parity-reference-trace.jsonl");

export const DEFAULT_PYFA_PYTHON = resolveDefaultPythonPath();

export async function runPyfaLocal(params) {
  const normalized = normalizeEft(params.eft);
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const hardKillMs = params.hardKillMs ?? DEFAULT_HARD_KILL_MS;
  const debug = Boolean(params.debug ?? process.env.DOGMA_PARITY_PYFA_DEBUG === "1");
  const pythonBin = params.pythonBin ?? process.env.DOGMA_PARITY_PYFA_PYTHON ?? DEFAULT_PYFA_PYTHON;
  const scriptPath = params.scriptPath ?? path.join(process.cwd(), "scripts", "pyfa_fitstats.py");
  const startedAt = Date.now();
  const diagBase = {
    fitId: params.fitId,
    shipTypeId: params.shipTypeId,
    timeoutMs,
    hardKillMs,
    pythonBin,
    scriptPath,
    normalizedEftHash: sha256(normalized.normalized),
    stage: "runtime"
  };

  try {
    const output = await runCommand(
      pythonBin,
      [scriptPath, "--stdin", "--json-only"],
      normalized.normalized,
      timeoutMs,
      hardKillMs
    );
    const parsed = parsePyfaOutput(
      output.stdout,
      params.fitId,
      params.shipTypeId,
      params.sdeVersion ?? "unknown",
      pythonBin
    );
    parsed.metadata = {
      ...parsed.metadata,
      pyfaMode: "local-python",
      pyfaVersion: "local-pyfa-direct-import"
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

export async function shutdownPyfaLocalRuntimes() {
  return;
}

export function parsePyfaOutput(stdout, fitId, shipTypeId, sdeVersion, runner = "python") {
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
      runner,
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

function runCommand(bin, args, input, timeoutMs, hardKillMs) {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, args, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new PyfaExecError(`command failed with exit code ${error.code ?? "unknown"}`, {
            stage: error.killed ? "timeout" : "runtime_error",
            elapsedMs: timeoutMs,
            stdoutTail: tail(stdout, 1000),
            stderrTail: tail(stderr, 1000),
            timeoutMs,
            hardKillMs
          })
        );
        return;
      }
      resolve({ stdout, stderr });
    });

    if (input) {
      child.stdin?.write(input);
    }
    child.stdin?.end();
  });
}

function resolveDefaultPythonPath() {
  const repoRoot = process.cwd();
  const candidates = [
    path.join(repoRoot, ".venv", "bin", "python3"),
    path.join(repoRoot, ".venv", "bin", "python"),
    path.join(repoRoot, ".venv", "Scripts", "python.exe"),
    "python3",
    "python"
  ];
  for (const candidate of candidates) {
    if (candidate === "python3" || candidate === "python" || existsSync(candidate)) {
      return candidate;
    }
  }
  return "python3";
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

class PyfaExecError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

function ensurePyfaError(error, defaults) {
  if (error instanceof PyfaExecError) {
    return error;
  }
  return new PyfaExecError(String(error?.message ?? error), {
    ...defaults,
    stdoutTail: error?.details?.stdoutTail ?? "",
    stderrTail: error?.details?.stderrTail ?? "",
    stage: error?.details?.stage ?? defaults.stage ?? "runtime_error"
  });
}
