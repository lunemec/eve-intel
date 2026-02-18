import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const sdeRoot = path.join(repoRoot, "data", "sde");
const manifestPath = path.join(sdeRoot, ".manifest.json");
const publicDataDir = path.join(repoRoot, "public", "data");

async function main() {
  const sdeManifest = await loadJson(manifestPath);
  if (!sdeManifest?.version) {
    throw new Error("Missing SDE manifest. Run `npm run sde:sync` first.");
  }
  const rawDir = path.join(sdeRoot, "raw", sdeManifest.version);

  const invTypes = await loadCsv(path.join(rawDir, "invTypes.csv"));
  const invGroups = await loadCsv(path.join(rawDir, "invGroups.csv"));
  const invCategories = await loadCsv(path.join(rawDir, "invCategories.csv"));
  const dgmTypeAttributes = await loadCsv(path.join(rawDir, "dgmTypeAttributes.csv"));
  const dgmTypeEffects = await loadCsv(path.join(rawDir, "dgmTypeEffects.csv"));
  const dgmAttributeTypes = await loadCsv(path.join(rawDir, "dgmAttributeTypes.csv"));
  const dgmEffects = await loadCsv(path.join(rawDir, "dgmEffects.csv"));

  const pyfaDbPath = path.join(repoRoot, "pyfa", "eve.db");
  if (existsSync(pyfaDbPath)) {
    const augmented = loadMissingShipRowsFromPyfa(pyfaDbPath, invTypes);
    mergeByKey(invTypes, augmented.invTypes, (row) => String(row.typeID));
    mergeByKey(invGroups, augmented.invGroups, (row) => String(row.groupID));
    mergeByKey(invCategories, augmented.invCategories, (row) => String(row.categoryID));
    mergeByKey(
      dgmTypeAttributes,
      augmented.dgmTypeAttributes,
      (row) => `${row.typeID}:${row.attributeID}`
    );
    mergeByKey(dgmTypeEffects, augmented.dgmTypeEffects, (row) => `${row.typeID}:${row.effectID}`);
    mergeByKey(dgmAttributeTypes, augmented.dgmAttributeTypes, (row) => String(row.attributeID));
    mergeByKey(dgmEffects, augmented.dgmEffects, (row) => String(row.effectID));
    if (augmented.missingShipCount > 0) {
      log(
        `augmented from pyfa/eve.db missingShips=${augmented.missingShipCount} groups=${augmented.invGroups.length} categories=${augmented.invCategories.length}`
      );
    }
  }

  const categoryByGroupId = new Map();
  for (const row of invGroups) {
    const groupId = toNumber(row.groupID);
    const categoryId = toNumber(row.categoryID);
    if (groupId !== undefined && categoryId !== undefined) {
      categoryByGroupId.set(groupId, categoryId);
    }
  }

  const attributeNameById = new Map();
  for (const row of dgmAttributeTypes) {
    const id = toNumber(row.attributeID);
    if (id === undefined) {
      continue;
    }
    const name = row.attributeName?.trim();
    if (name) {
      attributeNameById.set(id, name);
    }
  }

  const effectNameById = new Map();
  for (const row of dgmEffects) {
    const id = toNumber(row.effectID);
    if (id === undefined) {
      continue;
    }
    const name = row.effectName?.trim();
    if (name) {
      effectNameById.set(id, name);
    }
  }

  const attrsByTypeId = new Map();
  for (const row of dgmTypeAttributes) {
    const typeId = toNumber(row.typeID);
    const attributeId = toNumber(row.attributeID);
    const value =
      toNumber(row.valueFloat) ??
      toNumber(row.valueInt) ??
      toNumber(row.value);
    if (typeId === undefined || attributeId === undefined || value === undefined) {
      continue;
    }
    const list = attrsByTypeId.get(typeId) ?? [];
    list.push({ attributeId, value });
    attrsByTypeId.set(typeId, list);
  }

  const effectsByTypeId = new Map();
  for (const row of dgmTypeEffects) {
    const typeId = toNumber(row.typeID);
    const effectId = toNumber(row.effectID);
    if (typeId === undefined || effectId === undefined) {
      continue;
    }
    const list = effectsByTypeId.get(typeId) ?? [];
    list.push({ effectId });
    effectsByTypeId.set(typeId, list);
  }

  const typeEntries = [];
  for (const row of invTypes) {
    const typeId = toNumber(row.typeID);
    const groupId = toNumber(row.groupID);
    const typeName = row.typeName?.trim();
    if (typeId === undefined || groupId === undefined || !typeName) {
      continue;
    }

    const categoryId = categoryByGroupId.get(groupId);
    const attrs = {};
    const attrsById = {};
    for (const attr of attrsByTypeId.get(typeId) ?? []) {
      const attrName = attributeNameById.get(attr.attributeId) ?? `attr_${attr.attributeId}`;
      attrs[attrName] = attr.value;
      attrsById[attr.attributeId] = attr.value;
    }
    const effectRows = effectsByTypeId.get(typeId) ?? [];
    const effects = effectRows.map((effect) => effectNameById.get(effect.effectId) ?? `effect_${effect.effectId}`);
    const effectsById = effectRows.map((effect) => effect.effectId);
    const effectsMeta = effectRows.map((effect) => ({
      effectId: effect.effectId,
      effectName: effectNameById.get(effect.effectId) ?? `effect_${effect.effectId}`
    }));

    typeEntries.push({
      typeId,
      groupId,
      categoryId,
      name: typeName,
      attrs,
      attrsById,
      effects,
      effectsById,
      effectsMeta
    });
  }

  const groups = invGroups
    .map((row) => {
      const groupId = toNumber(row.groupID);
      if (groupId === undefined) {
        return null;
      }
      return {
        groupId,
        categoryId: toNumber(row.categoryID),
        name: row.groupName?.trim() || `Group ${groupId}`
      };
    })
    .filter((row) => row !== null);

  const categories = invCategories
    .map((row) => {
      const categoryId = toNumber(row.categoryID);
      if (categoryId === undefined) {
        return null;
      }
      return {
        categoryId,
        name: row.categoryName?.trim() || `Category ${categoryId}`
      };
    })
    .filter((row) => row !== null);

  const pack = {
    formatVersion: 1,
    source: sdeManifest.source,
    sdeVersion: sdeManifest.version,
    generatedAt: new Date().toISOString(),
    typeCount: typeEntries.length,
    types: typeEntries,
    groups,
    categories,
    attributeTypes: [...attributeNameById.entries()]
      .map(([attributeId, attributeName]) => ({ attributeId, attributeName }))
      .sort((a, b) => a.attributeId - b.attributeId),
    effectTypes: [...effectNameById.entries()]
      .map(([effectId, effectName]) => ({ effectId, effectName }))
      .sort((a, b) => a.effectId - b.effectId)
  };

  const serialized = `${JSON.stringify(pack)}\n`;
  const packHash = createHash("sha256").update(serialized).digest("hex");
  const packFile = `dogma-pack.${sdeManifest.version}.json`;

  await mkdir(publicDataDir, { recursive: true });
  await writeFile(path.join(publicDataDir, packFile), serialized, "utf8");
  await writeFile(
    path.join(publicDataDir, "dogma-manifest.json"),
    `${JSON.stringify(
      {
        activeVersion: sdeManifest.version,
        packFile,
        sha256: packHash,
        generatedAt: pack.generatedAt
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  log(`compiled ${packFile} (${typeEntries.length} types)`);
}

async function loadJson(filePath, fallback = null) {
  if (!existsSync(filePath)) {
    return fallback;
  }
  const raw = await readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function loadCsv(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = await readFile(filePath, "utf8");
  return parseCsv(raw);
}

function parseCsv(raw) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "\"") {
      if (inQuotes && raw[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === ",") {
      row.push(current);
      current = "";
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && raw[i + 1] === "\n") {
        i += 1;
      }
      row.push(current);
      current = "";
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      continue;
    }
    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }
  const headers = rows[0];
  const out = [];
  for (const values of rows.slice(1)) {
    const record = {};
    for (let i = 0; i < headers.length; i += 1) {
      record[headers[i]] = values[i] ?? "";
    }
    out.push(record);
  }
  return out;
}

function loadMissingShipRowsFromPyfa(dbPath, invTypesRows) {
  const requiredTables = new Set(["invtypes", "invgroups", "invcategories", "dgmtypeattribs", "dgmtypeeffects"]);
  const tableRows = querySqliteJson(
    dbPath,
    "select lower(name) as name from sqlite_master where type='table'",
    { suppressError: true, returnNullOnError: true }
  );
  if (tableRows === null) {
    log("unable to inspect pyfa/eve.db tables, skipping augmentation");
    return {
      missingShipCount: 0,
      invTypes: [],
      invGroups: [],
      invCategories: [],
      dgmTypeAttributes: [],
      dgmTypeEffects: [],
      dgmAttributeTypes: [],
      dgmEffects: []
    };
  }
  const tableNames = new Set(tableRows.map((row) => String(row.name ?? "").toLowerCase()).filter(Boolean));
  const missingRequired = [...requiredTables].filter((name) => !tableNames.has(name));
  if (missingRequired.length > 0) {
    log(`pyfa/eve.db missing required tables (${missingRequired.join(",")}), skipping augmentation`);
    return {
      missingShipCount: 0,
      invTypes: [],
      invGroups: [],
      invCategories: [],
      dgmTypeAttributes: [],
      dgmTypeEffects: [],
      dgmAttributeTypes: [],
      dgmEffects: []
    };
  }

  const existingTypeIds = new Set(
    invTypesRows
      .map((row) => toNumber(row.typeID))
      .filter((value) => value !== undefined)
  );

  const pyfaShipTypes = querySqliteJson(
    dbPath,
    "select t.typeID as typeID, t.groupID as groupID, t.typeName as typeName from invtypes t join invgroups g on g.groupID=t.groupID where g.categoryID=6 and t.published=1"
  );
  const missingShipTypes = pyfaShipTypes.filter((row) => !existingTypeIds.has(Number(row.typeID)));
  if (missingShipTypes.length === 0) {
    return {
      missingShipCount: 0,
      invTypes: [],
      invGroups: [],
      invCategories: [],
      dgmTypeAttributes: [],
      dgmTypeEffects: [],
      dgmAttributeTypes: [],
      dgmEffects: []
    };
  }

  const missingTypeIds = [...new Set(missingShipTypes.map((row) => Number(row.typeID)))];
  const missingGroupIds = [...new Set(missingShipTypes.map((row) => Number(row.groupID)))];

  const invGroups = querySqliteJson(
    dbPath,
    `select groupID as groupID, categoryID as categoryID, name as groupName from invgroups where groupID in (${sqlInList(missingGroupIds)})`
  );
  const missingCategoryIds = [...new Set(invGroups.map((row) => Number(row.categoryID)).filter(Number.isFinite))];
  const invCategories =
    missingCategoryIds.length > 0
      ? querySqliteJson(
          dbPath,
          `select categoryID as categoryID, name as categoryName from invcategories where categoryID in (${sqlInList(missingCategoryIds)})`
        )
      : [];

  const dgmTypeAttributes = querySqliteJson(
    dbPath,
    `select typeID as typeID, attributeID as attributeID, value as valueFloat from dgmtypeattribs where typeID in (${sqlInList(missingTypeIds)})`
  );
  const dgmTypeEffects = querySqliteJson(
    dbPath,
    `select typeID as typeID, effectID as effectID from dgmtypeeffects where typeID in (${sqlInList(missingTypeIds)})`
  );

  const missingAttrIds = [
    ...new Set(dgmTypeAttributes.map((row) => Number(row.attributeID)).filter(Number.isFinite))
  ];
  const missingEffectIds = [
    ...new Set(dgmTypeEffects.map((row) => Number(row.effectID)).filter(Number.isFinite))
  ];

  const dgmAttributeTypes =
    missingAttrIds.length > 0
      ? querySqliteJson(
          dbPath,
          `select attributeID as attributeID, attributeName as attributeName from dgmattribs where attributeID in (${sqlInList(missingAttrIds)})`
        )
      : [];
  const dgmEffects =
    missingEffectIds.length > 0
      ? querySqliteJson(
          dbPath,
          `select effectID as effectID, effectName as effectName from dgmeffects where effectID in (${sqlInList(missingEffectIds)})`
        )
      : [];

  return {
    missingShipCount: missingShipTypes.length,
    invTypes: missingShipTypes,
    invGroups,
    invCategories,
    dgmTypeAttributes,
    dgmTypeEffects,
    dgmAttributeTypes,
    dgmEffects
  };
}

function querySqliteJson(dbPath, sql, options = {}) {
  try {
    const raw = execFileSync("sqlite3", ["-json", dbPath, sql], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
    return JSON.parse(raw || "[]");
  } catch (error) {
    const fallback = querySqliteJsonViaPython(dbPath, sql);
    if (fallback.ok) {
      return fallback.rows;
    }
    if (!options.suppressError) {
      log(`pyfa sqlite query failed: ${String(error?.message ?? error)} | python fallback: ${fallback.reason}`);
    }
    if (options.returnNullOnError) {
      return null;
    }
    return [];
  }
}

function querySqliteJsonViaPython(dbPath, sql) {
  const candidates = [process.env.PYFA_PYTHON, "python", "python3"].filter(
    (value) => typeof value === "string" && value.trim().length > 0
  );
  const script = [
    "import json, sqlite3, sys",
    "db_path = sys.argv[1]",
    "query = sys.argv[2]",
    "con = sqlite3.connect(db_path)",
    "con.row_factory = sqlite3.Row",
    "cur = con.cursor()",
    "cur.execute(query)",
    "rows = [dict(row) for row in cur.fetchall()]",
    "print(json.dumps(rows))",
    "cur.close()",
    "con.close()"
  ].join(";");

  for (const cmd of candidates) {
    try {
      const raw = execFileSync(cmd, ["-c", script, dbPath, sql], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024
      });
      return { ok: true, rows: JSON.parse(raw || "[]") };
    } catch (error) {
      // try next interpreter
      if (cmd === candidates[candidates.length - 1]) {
        return { ok: false, reason: String(error?.message ?? error) };
      }
    }
  }

  return { ok: false, reason: "no python interpreter found for sqlite fallback" };
}

function sqlInList(values) {
  return values.map((value) => Number(value)).filter(Number.isFinite).join(",");
}

function mergeByKey(target, incoming, keyFn) {
  const existing = new Set(target.map((row) => keyFn(row)));
  for (const row of incoming) {
    const key = keyFn(row);
    if (existing.has(key)) {
      continue;
    }
    target.push(row);
    existing.add(key);
  }
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

function log(message) {
  console.log(`[sde:compile] ${message}`);
}

main().catch((error) => {
  console.error("[sde:compile] fatal", error);
  process.exit(1);
});
