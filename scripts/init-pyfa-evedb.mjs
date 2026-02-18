import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const pyfaDbPath = path.join(repoRoot, "pyfa", "eve.db");
const pyfaDbUpdatePath = path.join(repoRoot, "pyfa", "db_update.py");
const strict = process.env.PYFA_DB_INIT_STRICT === "1";
const requiredTables = ["invtypes", "invgroups", "invcategories", "dgmtypeattribs", "dgmtypeeffects"];

function log(message) {
  console.log(`[pyfa:db:init] ${message}`);
}

function warn(message) {
  console.warn(`[pyfa:db:init] ${message}`);
}

function getPythonLaunchers() {
  const configured = (process.env.PYFA_PYTHON ?? "").trim();
  const launchers = [];
  if (configured) {
    launchers.push({ cmd: configured, prefixArgs: [] });
  }
  launchers.push({ cmd: "python", prefixArgs: [] });
  launchers.push({ cmd: "python3", prefixArgs: [] });
  launchers.push({ cmd: "py", prefixArgs: ["-3"] });
  return launchers;
}

function runWithLaunchers(args, options = {}) {
  const launchers = getPythonLaunchers();
  const attempts = [];
  for (const launcher of launchers) {
    const result = spawnSync(launcher.cmd, [...launcher.prefixArgs, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      ...options
    });
    if (!result.error && result.status === 0) {
      return { ok: true, launcher, result, attempts };
    }
    attempts.push({ launcher, result });
  }
  return { ok: false, attempts };
}

function inspectDb() {
  if (!existsSync(pyfaDbPath)) {
    return { ready: false, reason: "missing-db-file", missing: requiredTables };
  }
  const script = `
import json, sqlite3
db = r"""${pyfaDbPath.replace(/\\/g, "\\\\")}"""
required = ${JSON.stringify(requiredTables)}
con = sqlite3.connect(db)
cur = con.cursor()
cur.execute("select name from sqlite_master where type='table'")
tables = {r[0].lower() for r in cur.fetchall()}
missing = [t for t in required if t not in tables]
print(json.dumps({"missing": missing, "table_count": len(tables)}))
con.close()
`;
  const run = runWithLaunchers(["-c", script]);
  if (!run.ok) {
    return { ready: false, reason: "python-unavailable", missing: requiredTables, run };
  }
  try {
    const payload = JSON.parse((run.result.stdout ?? "").trim() || "{}");
    const missing = Array.isArray(payload.missing) ? payload.missing : requiredTables;
    return {
      ready: missing.length === 0,
      reason: missing.length === 0 ? "ok" : "missing-required-tables",
      missing,
      tableCount: Number(payload.table_count ?? 0)
    };
  } catch {
    return { ready: false, reason: "inspect-parse-failed", missing: requiredTables };
  }
}

function summarizeAttempts(attempts) {
  return attempts
    .map(({ launcher, result }) => {
      const err = result.error ? String(result.error.message ?? result.error) : "";
      const stderr = (result.stderr ?? "").trim();
      return `${launcher.cmd}${launcher.prefixArgs.length ? ` ${launcher.prefixArgs.join(" ")}` : ""}: ${err || stderr || `exit ${result.status}`}`;
    })
    .join(" | ");
}

function maybeFail(message) {
  if (strict) {
    throw new Error(message);
  }
  warn(`${message} (continuing; set PYFA_DB_INIT_STRICT=1 to fail hard)`);
}

async function main() {
  const initial = inspectDb();
  if (initial.ready) {
    log(`pyfa/eve.db ready (tables=${initial.tableCount ?? "?"})`);
    return;
  }

  log(`pyfa/eve.db needs init (${initial.reason}; missing=${initial.missing?.join(",") ?? "unknown"})`);
  if (!existsSync(pyfaDbUpdatePath)) {
    maybeFail("pyfa/db_update.py not found");
    return;
  }

  const run = runWithLaunchers([pyfaDbUpdatePath], { stdio: "pipe" });
  if (!run.ok) {
    const postAttempt = inspectDb();
    if (postAttempt.ready) {
      warn(
        `pyfa db_update.py exited non-zero, but eve.db now has required tables (tables=${postAttempt.tableCount ?? "?"}); continuing`
      );
      return;
    }
    const detail = summarizeAttempts(run.attempts);
    maybeFail(`failed to run pyfa db_update.py. ${detail}`);
    warn("Install pyfa Python deps first, e.g. `python -m pip install -r pyfa/requirements.txt`.");
    return;
  }

  const finalState = inspectDb();
  if (!finalState.ready) {
    maybeFail(
      `pyfa db init completed but required tables are still missing (${finalState.missing?.join(",") ?? "unknown"})`
    );
    return;
  }

  log(`pyfa/eve.db initialized successfully (tables=${finalState.tableCount ?? "?"})`);
}

main().catch((error) => {
  console.error(`[pyfa:db:init] fatal ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
