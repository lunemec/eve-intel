import { readFile } from "node:fs/promises";

export async function parseSvcfitstatCallbackFixture(params) {
  const raw = await readFile(params.path, "utf8");
  const fitId = params.fitId ?? "svcfitstat-callback-sample";
  const shipTypeId = Number(params.shipTypeId ?? 52250);
  const sdeVersion = params.sdeVersion ?? "unknown";

  const dpsTotal = readScalar(raw, "totalDps");
  const alpha = readScalar(raw, "totalVolley");
  const ehp = readScalar(raw, "total", "ehp");

  const resists = {
    shield: {
      em: readNestedResist(raw, "shield", "em"),
      therm: readNestedResist(raw, "shield", "therm"),
      kin: readNestedResist(raw, "shield", "kin"),
      exp: readNestedResist(raw, "shield", "exp")
    },
    armor: {
      em: readNestedResist(raw, "armor", "em"),
      therm: readNestedResist(raw, "armor", "therm"),
      kin: readNestedResist(raw, "armor", "kin"),
      exp: readNestedResist(raw, "armor", "exp")
    },
    hull: {
      em: readNestedResist(raw, "hull", "em"),
      therm: readNestedResist(raw, "hull", "therm"),
      kin: readNestedResist(raw, "hull", "kin"),
      exp: readNestedResist(raw, "hull", "exp")
    }
  };

  return {
    fitId,
    shipTypeId,
    source: "svcfitstat",
    sdeVersion,
    dpsTotal,
    alpha,
    ehp,
    resists,
    metadata: {
      fixture: params.path
    }
  };
}

function readScalar(raw, key, scope) {
  const lines = raw.split(/\r?\n/);
  if (!scope) {
    const m = lines.find((line) => line.includes(`[${key}] =>`));
    if (!m) throw new Error(`Missing key ${key}`);
    return Number(m.split("=>")[1].trim());
  }

  const start = lines.findIndex((line) => line.includes(`[${scope}] => Array`));
  if (start < 0) throw new Error(`Missing scope ${scope}`);
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].includes(`[${key}] =>`)) {
      return Number(lines[i].split("=>")[1].trim());
    }
  }
  throw new Error(`Missing key ${scope}.${key}`);
}

function readNestedResist(raw, layer, dtype) {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes(`[${layer}] => Array`));
  if (start < 0) throw new Error(`Missing resist layer ${layer}`);
  for (let i = start + 1; i < Math.min(lines.length, start + 16); i += 1) {
    if (lines[i].includes(`[${dtype}] =>`)) {
      return Number(lines[i].split("=>")[1].trim());
    }
  }
  throw new Error(`Missing resist ${layer}.${dtype}`);
}
