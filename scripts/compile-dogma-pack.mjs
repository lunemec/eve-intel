import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
    for (const attr of attrsByTypeId.get(typeId) ?? []) {
      const attrName = attributeNameById.get(attr.attributeId) ?? `attr_${attr.attributeId}`;
      attrs[attrName] = attr.value;
    }
    const effects = (effectsByTypeId.get(typeId) ?? []).map((effect) => {
      return effectNameById.get(effect.effectId) ?? `effect_${effect.effectId}`;
    });

    typeEntries.push({
      typeId,
      groupId,
      categoryId,
      name: typeName,
      attrs,
      effects
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
    categories
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
