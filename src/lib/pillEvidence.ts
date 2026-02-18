export type RolePillName =
  | "Long Point"
  | "Web"
  | "HIC"
  | "Bubble"
  | "Boosh"
  | "Neut"
  | "Cloaky"
  | "Shield Logi"
  | "Armor Logi";

export type PillName = "Bait" | "Cyno" | RolePillName;

export type PillEvidenceCandidate = {
  pillName: PillName;
  causingModule: string;
  fitId: string;
  killmailId?: number;
  url?: string;
  timestamp?: string;
};

export type PillEvidence = {
  pillName: PillName;
  causingModule: string;
  fitId: string;
  killmailId: number;
  url: string;
  timestamp: string;
};

export type PillEvidenceByName = Partial<Record<PillName, PillEvidence>>;

export function isValidPillEvidenceCandidate(candidate: PillEvidenceCandidate): boolean {
  return toPillEvidence(candidate) !== undefined;
}

export function selectMostRecentPillEvidence(candidates: PillEvidenceCandidate[]): PillEvidence | undefined {
  let best: PillEvidence | undefined;
  let bestTime = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const normalized = toPillEvidence(candidate);
    if (!normalized) {
      continue;
    }
    const time = Date.parse(normalized.timestamp);
    if (!best || time > bestTime || (time === bestTime && normalized.killmailId > best.killmailId)) {
      best = normalized;
      bestTime = time;
    }
  }

  return best;
}

function toPillEvidence(candidate: PillEvidenceCandidate): PillEvidence | undefined {
  const causingModule = candidate.causingModule.trim();
  const fitId = candidate.fitId.trim();
  if (!causingModule || !fitId) {
    return undefined;
  }

  const killmailId = normalizeKillmailId(candidate.killmailId);
  if (killmailId === undefined) {
    return undefined;
  }

  const timestamp = normalizeTimestamp(candidate.timestamp);
  if (!timestamp) {
    return undefined;
  }

  const url = normalizeEvidenceUrl(candidate.url, killmailId);
  if (!url) {
    return undefined;
  }

  return {
    pillName: candidate.pillName,
    causingModule,
    fitId,
    killmailId,
    url,
    timestamp
  };
}

function normalizeKillmailId(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const asInt = Math.trunc(value);
  if (asInt !== value) {
    return undefined;
  }
  return asInt;
}

function normalizeTimestamp(timestamp: string | undefined): string | undefined {
  if (!timestamp || timestamp.trim().length === 0) {
    return undefined;
  }
  const epoch = Date.parse(timestamp);
  if (!Number.isFinite(epoch)) {
    return undefined;
  }
  return new Date(epoch).toISOString();
}

function normalizeEvidenceUrl(rawUrl: string | undefined, killmailId: number): string | undefined {
  if (!rawUrl || rawUrl.trim().length === 0) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "https:" || parsed.host !== "zkillboard.com") {
    return undefined;
  }

  const match = parsed.pathname.match(/^\/(?:kill|loss)\/(\d+)\/?$/);
  if (!match) {
    return undefined;
  }

  const urlKillmailId = Number(match[1]);
  if (!Number.isFinite(urlKillmailId) || urlKillmailId !== killmailId) {
    return undefined;
  }

  return parsed.toString();
}
