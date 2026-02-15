/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { fetchCharacterStats } from "./lib/api/zkill";

vi.mock("./lib/api/esi", () => ({
  resolveCharacterIds: vi.fn(async () => new Map([["a9tan", 12345]])),
  resolveInventoryTypeIdByName: vi.fn(async () => undefined),
  fetchCharacterPublic: vi.fn(async () => ({
    character_id: 12345,
    corporation_id: 54321,
    alliance_id: 0,
    name: "A9tan",
    security_status: 2.3
  })),
  resolveUniverseNames: vi.fn(async () => new Map([[54321, "Test Corp"]]))
}));

vi.mock("./lib/api/zkill", () => ({
  ZKILL_MAX_LOOKBACK_DAYS: 7,
  fetchCharacterStats: vi.fn(async () => null),
  fetchLatestKills: vi.fn(async () => []),
  fetchLatestKillsPaged: vi.fn(async () => []),
  fetchLatestLosses: vi.fn(async () => []),
  fetchLatestLossesPaged: vi.fn(async () => []),
  fetchRecentKills: vi.fn(async () => []),
  fetchRecentLosses: vi.fn(async () => [])
}));

describe("App paste flow", () => {
  it("parses clipboard payload immediately and renders pilot card", async () => {
    render(<App />);

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "A9tan"
      }
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(screen.getAllByText("A9tan").length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Likely Ships/i)).toBeTruthy();
  });

  it("derives low threat from merged kills/losses even if zKill danger is high", async () => {
    vi.mocked(fetchCharacterStats).mockResolvedValueOnce({
      kills: 1,
      losses: 31,
      solo: 0,
      danger: 99,
      iskDestroyed: 1000000,
      iskLost: 50000000
    });

    render(<App />);

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "A9tan"
      }
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(screen.getByText("LOW")).toBeTruthy();
    });
  });
});
