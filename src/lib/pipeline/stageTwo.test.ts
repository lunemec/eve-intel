import { describe, expect, it, vi } from "vitest";
import { fetchAndMergeStageTwoHistory } from "./stageTwo";
import type { ZkillKillmail } from "../api/zkill";

describe("pipeline/stageTwo", () => {
  it("fetches paged deep history, merges inference windows, and logs merged counts", async () => {
    const inferenceKills: ZkillKillmail[] = [
      { killmail_id: 1, killmail_time: "2026-01-01T00:00:00Z", victim: {}, attackers: [], zkb: {} }
    ];
    const inferenceLosses: ZkillKillmail[] = [
      { killmail_id: 10, killmail_time: "2026-01-01T00:00:00Z", victim: {}, attackers: [], zkb: {} }
    ];
    const deepKills: ZkillKillmail[] = [
      { killmail_id: 2, killmail_time: "2026-01-02T00:00:00Z", victim: {}, attackers: [], zkb: {} }
    ];
    const deepLosses: ZkillKillmail[] = [
      { killmail_id: 11, killmail_time: "2026-01-02T00:00:00Z", victim: {}, attackers: [], zkb: {} }
    ];

    const onRetry = (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined;
    const logDebug = vi.fn();

    const result = await fetchAndMergeStageTwoHistory(
      {
        pilotName: "Pilot A",
        characterId: 101,
        inferenceKills,
        inferenceLosses,
        maxPages: 20,
        signal: undefined,
        onRetry,
        logDebug
      },
      {
        fetchLatestKillsPaged: vi.fn(async () => deepKills),
        fetchLatestLossesPaged: vi.fn(async () => deepLosses),
        mergeKillmailLists: vi.fn((primary, secondary) => [...primary, ...secondary])
      }
    );

    expect(result.mergedInferenceKills).toHaveLength(2);
    expect(result.mergedInferenceLosses).toHaveLength(2);
    expect(logDebug).toHaveBeenCalledWith("Pilot deep history merged", {
      pilot: "Pilot A",
      inferenceKills: 2,
      inferenceLosses: 2
    });
  });
});
