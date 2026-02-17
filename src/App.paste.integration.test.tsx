/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { fetchCharacterPublic, resolveUniverseNames } from "./lib/api/esi";
import { fetchCharacterStats } from "./lib/api/zkill";
import { fetchRecentKills, fetchRecentLosses } from "./lib/api/zkill";

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

  it("renders resolved corp/alliance/ship/module names instead of fallback IDs", async () => {
    vi.mocked(resolveUniverseNames).mockImplementation(async (ids) => {
      const out = new Map<number, string>();
      for (const id of ids) {
        if (id === 54321) out.set(id, "Readable Corp");
        if (id === 98765) out.set(id, "Readable Alliance");
        if (id === 12731) out.set(id, "Readable Ship");
        if (id === 2103) out.set(id, "Readable Module");
      }
      return out;
    });
    vi.mocked(fetchRecentKills).mockResolvedValueOnce([
      {
        killmail_id: 9001,
        killmail_time: "2026-02-13T00:00:00Z",
        victim: {},
        attackers: [{ character_id: 12345, ship_type_id: 12731 }],
        zkb: { totalValue: 1500000000 }
      }
    ]);
    vi.mocked(fetchRecentLosses).mockResolvedValueOnce([
      {
        killmail_id: 9002,
        killmail_time: "2026-02-12T00:00:00Z",
        victim: {
          character_id: 12345,
          ship_type_id: 12731,
          items: [{ item_type_id: 2103, flag: 27 }]
        },
        attackers: [],
        zkb: { totalValue: 900000000 }
      }
    ]);
    vi.mocked(fetchCharacterStats).mockResolvedValueOnce(null);
    vi.mocked(fetchCharacterPublic).mockResolvedValueOnce({
      character_id: 12345,
      corporation_id: 54321,
      alliance_id: 98765,
      name: "A9tan",
      security_status: 2.3
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
      expect(screen.getAllByText("Readable Corp").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Readable Alliance").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Readable Ship").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Corp 54321")).toBeNull();
    expect(screen.queryByText("Alliance 98765")).toBeNull();
    expect(screen.queryByText("Type 12731")).toBeNull();
  });
});
