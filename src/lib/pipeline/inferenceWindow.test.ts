import { describe, expect, it, vi } from "vitest";
import { fetchPilotInferenceWindow } from "./inferenceWindow";

describe("pipeline/inferenceWindow", () => {
  it("uses latest kills/losses fallback when recent windows are empty", async () => {
    const logDebug = vi.fn();
    const onRetry = (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined;
    const result = await fetchPilotInferenceWindow(
      {
        pilotName: "Pilot A",
        characterId: 101,
        lookbackDays: 7,
        signal: undefined,
        onRetry,
        logDebug
      },
      {
        fetchCharacterPublic: vi.fn(async () => ({
          character_id: 101,
          name: "Pilot A",
          corporation_id: 1
        })),
        fetchRecentKills: vi.fn(async () => []),
        fetchRecentLosses: vi.fn(async () => []),
        fetchLatestKills: vi.fn(async () => [{ killmail_id: 1, killmail_time: "2026-01-01T00:00:00Z", victim: {}, attackers: [], zkb: {} }]),
        fetchLatestLosses: vi.fn(async () => [{ killmail_id: 2, killmail_time: "2026-01-01T00:00:00Z", victim: {}, attackers: [], zkb: {} }]),
        fetchCharacterStats: vi.fn(async () => null)
      }
    );

    expect(result.inferenceKills).toHaveLength(1);
    expect(result.inferenceLosses).toHaveLength(1);
    expect(logDebug).toHaveBeenCalledWith(
      "Fallback zKill inference window used",
      expect.objectContaining({ pilot: "Pilot A", characterId: 101 })
    );
  });

  it("keeps recent windows when non-empty without fallback calls", async () => {
    const logDebug = vi.fn();
    const onRetry = (_scope: string) => (_info: { status: number; attempt: number; delayMs: number }) => undefined;
    const fetchLatestKills = vi.fn(async () => []);
    const fetchLatestLosses = vi.fn(async () => []);
    const result = await fetchPilotInferenceWindow(
      {
        pilotName: "Pilot A",
        characterId: 101,
        lookbackDays: 7,
        signal: undefined,
        onRetry,
        logDebug
      },
      {
        fetchCharacterPublic: vi.fn(async () => ({
          character_id: 101,
          name: "Pilot A",
          corporation_id: 1
        })),
        fetchRecentKills: vi.fn(async () => [{ killmail_id: 10, killmail_time: "2026-01-01T00:00:00Z", victim: {}, attackers: [], zkb: {} }]),
        fetchRecentLosses: vi.fn(async () => [{ killmail_id: 11, killmail_time: "2026-01-01T00:00:00Z", victim: {}, attackers: [], zkb: {} }]),
        fetchLatestKills,
        fetchLatestLosses,
        fetchCharacterStats: vi.fn(async () => null)
      }
    );

    expect(result.inferenceKills).toHaveLength(1);
    expect(result.inferenceLosses).toHaveLength(1);
    expect(fetchLatestKills).not.toHaveBeenCalled();
    expect(fetchLatestLosses).not.toHaveBeenCalled();
  });
});
