export function normalizeEft(eft) {
  const lines = eft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0 || !lines[0].startsWith("[")) {
    throw new Error("Invalid EFT fit");
  }

  const header = lines[0].replace(/^\[/, "").replace(/\]$/, "");
  const [ship, fitName = "Fit"] = header.split(",", 2).map((v) => v.trim());

  const modules = lines
    .slice(1)
    .filter((line) => !isSectionHeader(line))
    .filter((line) => !/^\[empty .*slot\]$/i.test(line))
    .map((line) => canonicalizeLine(line));

  modules.sort((a, b) => a.localeCompare(b));

  const normalized = [`[${ship}, ${fitName}]`, ...modules].join("\n");
  return { shipName: ship, normalized };
}

function canonicalizeLine(line) {
  const cleaned = line.replace(/\s+/g, " ").trim();
  return cleaned.replace(/\s*,\s*/g, ", ");
}

function isSectionHeader(line) {
  const normalized = line.toLowerCase().replace(/:$/, "").trim();
  return (
    normalized === "high slots" ||
    normalized === "high slot" ||
    normalized === "mid slots" ||
    normalized === "mid slot" ||
    normalized === "medium slots" ||
    normalized === "low slots" ||
    normalized === "low slot" ||
    normalized === "rig slots" ||
    normalized === "rig slot" ||
    normalized === "cargo" ||
    normalized === "cargo hold" ||
    normalized === "drones" ||
    normalized === "drone bay"
  );
}
