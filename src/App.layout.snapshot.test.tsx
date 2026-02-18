/**
 * @vitest-environment jsdom
 */
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./lib/api/esi", () => ({
  resolveCharacterIds: vi.fn(async () => new Map([["caserlist", 1962038711]])),
  resolveInventoryTypeIdByName: vi.fn(async () => undefined),
  fetchCharacterPublic: vi.fn(async () => ({
    character_id: 1962038711,
    corporation_id: 98094266,
    alliance_id: 0,
    name: "Caserlist",
    security_status: 4.9
  })),
  resolveUniverseNames: vi.fn(async () =>
    new Map<number, string>([
      [98094266, "Kingdom of Candats"],
      [12731, "Impel"],
      [2103, "Covert Cynosural Field Generator I"],
      [12058, "50MN Y-T8 Compact Microwarpdrive"],
      [2281, "Damage Control II"]
    ])
  )
}));

vi.mock("./lib/api/zkill", () => ({
  ZKILL_MAX_LOOKBACK_DAYS: 7,
  fetchCharacterStats: vi.fn(async () => null),
  fetchLatestKills: vi.fn(async () => []),
  fetchLatestKillsPage: vi.fn(async (_characterId: number, page: number) => (page === 1 ? [
    {
      killmail_id: 9001,
      killmail_time: "2026-02-13T00:00:00Z",
      victim: {},
      attackers: [{ character_id: 1962038711, ship_type_id: 12731 }],
      zkb: { totalValue: 1500000000 }
    }
  ] : [])),
  fetchLatestKillsPaged: vi.fn(async () => []),
  fetchLatestLosses: vi.fn(async () => []),
  fetchLatestLossesPage: vi.fn(async (_characterId: number, page: number) => (page === 1 ? [
    {
      killmail_id: 9002,
      killmail_time: "2026-02-12T00:00:00Z",
      victim: {
        character_id: 1962038711,
        ship_type_id: 12731,
        items: [
          { item_type_id: 2103, flag: 27 },
          { item_type_id: 12058, flag: 19 },
          { item_type_id: 2281, flag: 12 }
        ]
      },
      attackers: [],
      zkb: { totalValue: 900000000 }
    }
  ] : [])),
  fetchLatestLossesPaged: vi.fn(async () => []),
  fetchRecentKills: vi.fn(async () => [
    {
      killmail_id: 9001,
      killmail_time: "2026-02-13T00:00:00Z",
      victim: {},
      attackers: [{ character_id: 1962038711, ship_type_id: 12731 }],
      zkb: { totalValue: 1500000000 }
    }
  ]),
  fetchRecentLosses: vi.fn(async () => [
    {
      killmail_id: 9002,
      killmail_time: "2026-02-12T00:00:00Z",
      victim: {
        character_id: 1962038711,
        ship_type_id: 12731,
        items: [
          { item_type_id: 2103, flag: 27 },
          { item_type_id: 12058, flag: 19 },
          { item_type_id: 2281, flag: 12 }
        ]
      },
      attackers: [],
      zkb: { totalValue: 900000000 }
    }
  ])
}));

describe("App card layout snapshots", () => {
  it("matches pilot-card markup snapshot for EVEOS-style layout", async () => {
    const { container } = render(<App />);

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "Caserlist"
      }
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(container.querySelector(".pilot-card")).toBeTruthy();
      expect(container.querySelector(".fit-copy-button")).toBeTruthy();
      expect(container.querySelector(".ship-eft")).toBeTruthy();
    });

    const card = container.querySelector(".pilot-card");
    expect(card?.outerHTML).not.toContain("Parse:");
    expect(card?.outerHTML).not.toContain("class=\"risk-row\"");
    expect(card?.outerHTML).not.toContain("Potential Cyno");
    expect(card?.outerHTML).not.toContain("% cyno");
    expect(card?.outerHTML).toMatchSnapshot();
  });
});
