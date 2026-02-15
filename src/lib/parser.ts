import type { ParseResult, ParsedPilotInput } from "../types";

const PILOT_WITH_SHIP_REGEX = /^(.+?)\s*\(([^()]+)\)\s*$/;
const VALID_PILOT_REGEX = /^[\p{L}\p{N} ._'-]{2,64}$/u;
const URL_TAG_NAME_REGEX = /<url=[^>]+>([^<]+)<\/url>/giu;

function normalizePilotName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function normalizeShipName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function parseClipboardText(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const entries: ParsedPilotInput[] = [];
  const rejected: string[] = [];

  for (const line of lines) {
    const candidates = extractPilotCandidates(line);
    let parsedFromLine = false;

    for (const candidate of candidates) {
      const withShip = candidate.match(PILOT_WITH_SHIP_REGEX);
      if (withShip) {
        const pilotName = normalizePilotName(withShip[1]);
        const explicitShip = normalizeShipName(withShip[2]);
        if (VALID_PILOT_REGEX.test(pilotName) && explicitShip.length > 1) {
          entries.push({
            pilotName,
            explicitShip,
            sourceLine: line,
            parseConfidence: 0.98,
            shipSource: "explicit"
          });
          parsedFromLine = true;
          continue;
        }
      }

      const pilotOnly = normalizePilotName(candidate);
      if (VALID_PILOT_REGEX.test(pilotOnly)) {
        entries.push({
          pilotName: pilotOnly,
          sourceLine: line,
          parseConfidence: 0.9,
          shipSource: "inferred"
        });
        parsedFromLine = true;
        continue;
      }
    }

    if (!parsedFromLine) {
      rejected.push(line);
    }
  }

  const deduped = dedupeEntries(entries);
  return { entries: deduped, rejected };
}

function extractPilotCandidates(line: string): string[] {
  const firstGt = line.indexOf(">");
  const tail = firstGt >= 0 ? line.slice(firstGt + 1).trim() : line.trim();
  if (!tail) {
    return [line.trim()].filter(Boolean);
  }

  const urlMatches = [...tail.matchAll(URL_TAG_NAME_REGEX)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (urlMatches.length > 0) {
    return urlMatches;
  }

  return [tail];
}

function dedupeEntries(entries: ParsedPilotInput[]): ParsedPilotInput[] {
  const byPilot = new Map<string, ParsedPilotInput>();

  for (const entry of entries) {
    const key = entry.pilotName.toLowerCase();
    const existing = byPilot.get(key);
    if (!existing) {
      byPilot.set(key, entry);
      continue;
    }

    if (existing.shipSource === "inferred" && entry.shipSource === "explicit") {
      byPilot.set(key, entry);
    }
  }

  return [...byPilot.values()];
}
