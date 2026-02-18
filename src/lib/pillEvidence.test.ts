import { describe, expect, it } from "vitest";
import {
  isValidPillEvidenceCandidate,
  selectMostRecentPillEvidence,
  type PillEvidenceCandidate
} from "./pillEvidence";

function candidate(overrides: Partial<PillEvidenceCandidate> = {}): PillEvidenceCandidate {
  return {
    pillName: "Web",
    causingModule: "Stasis Webifier II",
    fitId: "fit-1",
    killmailId: 42,
    url: "https://zkillboard.com/kill/42/",
    timestamp: "2026-02-16T12:00:00Z",
    ...overrides
  };
}

describe("pillEvidence", () => {
  it("validates candidate shape requirements", () => {
    expect(isValidPillEvidenceCandidate(candidate())).toBe(true);
    expect(isValidPillEvidenceCandidate(candidate({ killmailId: 0 }))).toBe(false);
    expect(isValidPillEvidenceCandidate(candidate({ url: "" }))).toBe(false);
    expect(isValidPillEvidenceCandidate(candidate({ url: "https://example.com/kill/42/" }))).toBe(false);
    expect(isValidPillEvidenceCandidate(candidate({ timestamp: "not-a-date" }))).toBe(false);
  });

  it("selects the most recent valid candidate by timestamp", () => {
    const selected = selectMostRecentPillEvidence([
      candidate({ killmailId: 101, url: "https://zkillboard.com/kill/101/", timestamp: "2026-01-01T00:00:00Z" }),
      candidate({ killmailId: 102, url: "https://zkillboard.com/kill/102/", timestamp: "2026-02-01T00:00:00Z" }),
      candidate({ killmailId: undefined, url: "https://zkillboard.com/kill/103/" }),
      candidate({ killmailId: 104, url: "https://example.com/kill/104/" })
    ]);

    expect(selected?.killmailId).toBe(102);
    expect(selected?.url).toBe("https://zkillboard.com/kill/102/");
    expect(selected?.timestamp).toBe("2026-02-01T00:00:00.000Z");
  });

  it("breaks timestamp ties by higher killmail ID", () => {
    const selected = selectMostRecentPillEvidence([
      candidate({ killmailId: 200, url: "https://zkillboard.com/kill/200/", timestamp: "2026-02-02T00:00:00Z" }),
      candidate({ killmailId: 300, url: "https://zkillboard.com/kill/300/", timestamp: "2026-02-02T00:00:00Z" })
    ]);

    expect(selected?.killmailId).toBe(300);
    expect(selected?.url).toBe("https://zkillboard.com/kill/300/");
  });

  it("returns undefined when no candidate is valid", () => {
    const selected = selectMostRecentPillEvidence([
      candidate({ killmailId: undefined }),
      candidate({ url: "https://example.com/kill/1/" }),
      candidate({ timestamp: "invalid" })
    ]);

    expect(selected).toBeUndefined();
  });
});
