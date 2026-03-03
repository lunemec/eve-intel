/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fetchCharacterPublic, resolveUniverseNames } from "./lib/api/esi";
import { fetchCharacterStats } from "./lib/api/zkill";
import {
  fetchLatestKillsPage,
  fetchLatestLossesPage
} from "./lib/api/zkill";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    }
  };
}

vi.mock("./lib/api/esi", () => ({
  resolveCharacterIds: vi.fn(async (names: string[]) => {
    const map = new Map<string, number>();
    for (const name of names) {
      const normalized = name.trim().toLowerCase();
      if (normalized === "a9tan") {
        map.set(normalized, 12345);
      }
      if (normalized === "b9tan") {
        map.set(normalized, 67890);
      }
    }
    return map;
  }),
  resolveInventoryTypeIdByName: vi.fn(async () => undefined),
  fetchCharacterPublic: vi.fn(async (characterId: number) => {
    if (characterId === 67890) {
      return {
        character_id: 67890,
        corporation_id: 98765,
        alliance_id: 0,
        name: "B9tan",
        security_status: 2.1
      };
    }
    return {
      character_id: 12345,
      corporation_id: 54321,
      alliance_id: 0,
      name: "A9tan",
      security_status: 2.3
    };
  }),
  resolveUniverseNames: vi.fn(async () => new Map([[54321, "Test Corp"]]))
}));

vi.mock("./lib/api/zkill", () => ({
  ZKILL_MAX_LOOKBACK_DAYS: 7,
  fetchCharacterStats: vi.fn(async () => null),
  fetchLatestKills: vi.fn(async () => []),
  fetchLatestKillsPage: vi.fn(async (_characterId: number, page: number) => (page === 1 ? [] : [])),
  fetchLatestKillsPaged: vi.fn(async () => []),
  fetchLatestLosses: vi.fn(async () => []),
  fetchLatestLossesPage: vi.fn(async (_characterId: number, page: number) => (page === 1 ? [] : [])),
  fetchLatestLossesPaged: vi.fn(async () => []),
  fetchRecentKills: vi.fn(async () => []),
  fetchRecentLosses: vi.fn(async () => [])
}));

vi.mock("./lib/fleetGroupingCache", async () => {
  const actual = await vi.importActual<typeof import("./lib/fleetGroupingCache")>("./lib/fleetGroupingCache");
  return {
    ...actual,
    loadFleetGroupingArtifact: vi.fn(async () => ({ artifact: null, stale: false })),
    saveFleetGroupingArtifact: vi.fn(async () => undefined),
    isFleetGroupingArtifactUsable: vi.fn(() => false)
  };
});

describe("App paste flow", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("indexedDB", undefined);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      configurable: true
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn(async () => undefined)
      },
      configurable: true
    });
    for (const key of [
      "eve-intel.settings.v1",
      "eve-intel.debug-enabled.v1"
    ]) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore storage cleanup failures in tests.
      }
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows debug log copy button when debug logging is enabled and copies content", async () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: "Copy debug log" })).toBeNull();

    const debugToggle = screen.getByRole("checkbox");
    (debugToggle as HTMLInputElement).click();

    const copyButton = await screen.findByRole("button", { name: "Copy debug log" });
    expect(copyButton).toBeTruthy();
    copyButton.click();

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });
  });

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
      expect(screen.getAllByRole("heading", { name: /Likely Ships/i }).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("A9tan").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(vi.mocked(fetchLatestKillsPage)).toHaveBeenCalled();
      expect(vi.mocked(fetchLatestLossesPage)).toHaveBeenCalled();
    });
  });

  it("shows Fleet Summary with suggested pilots when one selected pilot has visible suggestions", async () => {
    const suggestedPilotId = 999001;
    const suggestedPilotName = "Suggested Wingman";
    vi.mocked(fetchCharacterPublic).mockImplementation(async (characterId: number) => {
      if (characterId === suggestedPilotId) {
        return {
          character_id: suggestedPilotId,
          corporation_id: 9990011,
          alliance_id: 0,
          name: suggestedPilotName,
          security_status: 3.2
        };
      }
      return {
        character_id: 12345,
        corporation_id: 54321,
        alliance_id: 0,
        name: "A9tan",
        security_status: 2.3
      };
    });
    vi.mocked(resolveUniverseNames).mockImplementation(async (ids) => {
      const names = new Map<number, string>();
      for (const id of ids) {
        if (id === 54321) names.set(id, "Test Corp");
        if (id === 9990011) names.set(id, "Suggested Corp");
        if (id === 12731) names.set(id, "Onyx");
        if (id === 22436) names.set(id, "Widow");
        if (id === suggestedPilotId) names.set(id, suggestedPilotName);
      }
      return names;
    });
    vi.mocked(fetchLatestKillsPage).mockImplementation(async (_characterId: number, page: number) => {
      if (page !== 1) {
        return [];
      }
      return Array.from({ length: 10 }, (_, index) => ({
        killmail_id: 20_000 + index,
        killmail_time: `2026-02-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
        victim: {},
        attackers: [
          { character_id: 12345, ship_type_id: 12731 },
          { character_id: suggestedPilotId, ship_type_id: 22436 }
        ],
        zkb: { totalValue: 1500000000 }
      }));
    });
    vi.mocked(fetchLatestLossesPage).mockImplementation(async () => []);

    const { container } = render(<App />);

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "A9tan"
      }
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(screen.getByText("Fleet Summary")).toBeTruthy();
      expect(screen.getAllByText(suggestedPilotName).length).toBeGreaterThan(0);
      expect(container.querySelectorAll(".fleet-summary-line").length).toBeGreaterThan(1);
    }, { timeout: 2500 });

    await waitFor(() => {
      expect(vi.mocked(fetchLatestKillsPage).mock.calls.some((call) => call[0] === suggestedPilotId)).toBe(true);
      expect(container.querySelectorAll("article.pilot-card").length).toBeGreaterThan(1);
    }, { timeout: 2500 });

    const suggestedCard = screen
      .getAllByText(suggestedPilotName)
      .map((node) => node.closest("article.pilot-card"))
      .find((card): card is HTMLElement => Boolean(card));
    expect(suggestedCard?.className).toContain("is-suggested");
  });

  it("keeps grouped pilots together in summary/details and places suggested pilots last within the group", async () => {
    const suggestedPilotId = 999001;
    const suggestedPilotName = "Suggested Wingman";
    const ungroupedPilotId = 777001;
    const ungroupedPilotName = "C9tan";
    const ungroupedCorpId = 7770021;

    const { resolveCharacterIds } = await import("./lib/api/esi");
    vi.mocked(resolveCharacterIds).mockImplementation(async (names: string[]) => {
      const map = new Map<string, number>();
      for (const name of names) {
        const normalized = name.trim().toLowerCase();
        if (normalized === "a9tan") {
          map.set(normalized, 12345);
        }
        if (normalized === "b9tan") {
          map.set(normalized, 67890);
        }
        if (normalized === "c9tan") {
          map.set(normalized, ungroupedPilotId);
        }
      }
      return map;
    });

    vi.mocked(fetchCharacterPublic).mockImplementation(async (characterId: number) => {
      if (characterId === 67890) {
        return {
          character_id: 67890,
          corporation_id: 98765,
          alliance_id: 0,
          name: "B9tan",
          security_status: 2.1
        };
      }
      if (characterId === ungroupedPilotId) {
        return {
          character_id: ungroupedPilotId,
          corporation_id: ungroupedCorpId,
          alliance_id: 0,
          name: ungroupedPilotName,
          security_status: 2.5
        };
      }
      if (characterId === suggestedPilotId) {
        return {
          character_id: suggestedPilotId,
          corporation_id: 9990011,
          alliance_id: 0,
          name: suggestedPilotName,
          security_status: 3.2
        };
      }
      return {
        character_id: 12345,
        corporation_id: 54321,
        alliance_id: 0,
        name: "A9tan",
        security_status: 2.3
      };
    });

    vi.mocked(resolveUniverseNames).mockImplementation(async (ids) => {
      const names = new Map<number, string>();
      for (const id of ids) {
        if (id === 54321) names.set(id, "Test Corp");
        if (id === 98765) names.set(id, "Bravo Corp");
        if (id === ungroupedCorpId) names.set(id, "Ungrouped Corp");
        if (id === 9990011) names.set(id, "Suggested Corp");
        if (id === 12731) names.set(id, "Onyx");
        if (id === 22436) names.set(id, "Widow");
        if (id === 22456) names.set(id, "Sabre");
        if (id === 33816) names.set(id, "Garmur");
        if (id === suggestedPilotId) names.set(id, suggestedPilotName);
      }
      return names;
    });

    const groupedKills = Array.from({ length: 10 }, (_, index) => ({
      killmail_id: 30_000 + index,
      killmail_time: `2026-02-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      victim: {},
      attackers: [
        { character_id: 12345, ship_type_id: 12731 },
        { character_id: 67890, ship_type_id: 22456 },
        { character_id: suggestedPilotId, ship_type_id: 22436 }
      ],
      zkb: { totalValue: 1900000000 }
    }));
    const ungroupedKills = Array.from({ length: 10 }, (_, index) => ({
      killmail_id: 40_000 + index,
      killmail_time: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      victim: {},
      attackers: [{ character_id: ungroupedPilotId, ship_type_id: 33816 }],
      zkb: { totalValue: 120000000 }
    }));

    vi.mocked(fetchLatestKillsPage).mockImplementation(async (characterId: number, page: number) => {
      if (page !== 1) {
        return [];
      }
      if (characterId === 12345 || characterId === 67890) {
        return groupedKills;
      }
      if (characterId === ungroupedPilotId) {
        return ungroupedKills;
      }
      if (characterId === suggestedPilotId) {
        return groupedKills;
      }
      return [];
    });
    vi.mocked(fetchLatestLossesPage).mockImplementation(async () => []);

    const { container } = render(<App />);

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "A9tan\nB9tan\nC9tan"
      }
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(screen.getByText("Fleet Summary")).toBeTruthy();
      expect(screen.getAllByText(suggestedPilotName).length).toBeGreaterThan(0);
      expect(container.querySelectorAll("article.pilot-card").length).toBeGreaterThanOrEqual(4);
    }, { timeout: 3000 });

    const summaryNames = [...container.querySelectorAll(".fleet-summary-line .fleet-summary-name")]
      .map((node) => node.textContent?.trim() ?? "")
      .filter((name) => name.length > 0);
    expect(summaryNames.slice(0, 4)).toEqual(["A9tan", "B9tan", suggestedPilotName, ungroupedPilotName]);

    const detailNames = [...container.querySelectorAll("article.pilot-card .player-name")]
      .map((node) => node.textContent?.trim() ?? "")
      .filter((name) => name.length > 0);
    expect(detailNames.slice(0, 4)).toEqual(["A9tan", "B9tan", suggestedPilotName, ungroupedPilotName]);

    const summaryRows = [...container.querySelectorAll(".fleet-summary-line")] as HTMLElement[];
    const findSummaryRowByName = (name: string) =>
      summaryRows.find((row) => row.querySelector(".fleet-summary-name")?.textContent?.trim() === name);
    const groupedRowAlpha = findSummaryRowByName("A9tan");
    const groupedRowBravo = findSummaryRowByName("B9tan");
    const groupedSuggestedRow = findSummaryRowByName(suggestedPilotName);
    const ungroupedRow = findSummaryRowByName(ungroupedPilotName);
    const groupedId = groupedRowAlpha?.getAttribute("data-group-id");

    expect(groupedId).toBeTruthy();
    expect(groupedRowBravo?.getAttribute("data-group-id")).toBe(groupedId);
    expect(groupedSuggestedRow?.getAttribute("data-group-id")).toBe(groupedId);
    expect(groupedSuggestedRow?.className).toContain("is-suggested");
    expect(ungroupedRow?.getAttribute("data-group-id")).not.toBe(groupedId);
  });

  it("uses zKill dangerous metric for player threat and danger row", async () => {
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
      expect(screen.getByText("HIGH")).toBeTruthy();
      expect(screen.getByText("9.9")).toBeTruthy();
      expect(screen.getByText("99%")).toBeTruthy();
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
    vi.mocked(fetchLatestKillsPage).mockImplementationOnce(async (_characterId, page) => (page === 1 ? [
      {
        killmail_id: 9001,
        killmail_time: "2026-02-13T00:00:00Z",
        victim: {},
        attackers: [{ character_id: 12345, ship_type_id: 12731 }],
        zkb: { totalValue: 1500000000 }
      }
    ] : []));
    vi.mocked(fetchLatestLossesPage).mockImplementationOnce(async (_characterId, page) => (page === 1 ? [
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
    ] : []));
    vi.mocked(fetchCharacterStats).mockResolvedValueOnce(null);
    vi.mocked(fetchCharacterPublic).mockResolvedValue({
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

  it("loads saved lookbackDays from settings storage", async () => {
    localStorage.setItem("eve-intel.settings.v1", JSON.stringify({ lookbackDays: 3 }));

    render(<App />);

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "A9tan"
      }
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(vi.mocked(fetchLatestKillsPage)).toHaveBeenCalled();
    });
    expect(JSON.parse(localStorage.getItem("eve-intel.settings.v1") ?? "{}")).toEqual({ lookbackDays: 3 });
  });

  it("clamps out-of-range saved lookbackDays values", async () => {
    localStorage.setItem("eve-intel.settings.v1", JSON.stringify({ lookbackDays: 0 }));

    render(<App />);

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "A9tan"
      }
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(vi.mocked(fetchLatestKillsPage)).toHaveBeenCalled();
    });
    expect(JSON.parse(localStorage.getItem("eve-intel.settings.v1") ?? "{}")).toEqual({ lookbackDays: 1 });
  });

  it("renders unresolved pilots as error cards", async () => {
    const { resolveCharacterIds } = await import("./lib/api/esi");
    vi.mocked(resolveCharacterIds).mockResolvedValueOnce(new Map());
    render(<App />);

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "Ghost Pilot"
      }
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(screen.getAllByText(/Character not found in ESI\./i).length).toBeGreaterThan(0);
    });

    expect(vi.mocked(fetchLatestKillsPage)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchLatestLossesPage)).not.toHaveBeenCalled();
  });

  it("deduplicates repeated pilot lines into one card", async () => {
    const { container } = render(<App />);

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "A9tan\nA9tan"
      }
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(container.querySelectorAll("article.pilot-card").length).toBe(1);
    });
  });

  it("does not restart pilot fetches when repasting identical semantic list", async () => {
    render(<App />);

    const first = new Event("paste") as ClipboardEvent;
    Object.defineProperty(first, "clipboardData", {
      value: {
        getData: () => "A9tan"
      }
    });
    window.dispatchEvent(first);

    await waitFor(() => {
      expect(vi.mocked(fetchLatestKillsPage).mock.calls.some((call) => call[0] === 12345)).toBe(true);
      expect(vi.mocked(fetchLatestLossesPage).mock.calls.some((call) => call[0] === 12345)).toBe(true);
    });
    const killsBefore = vi.mocked(fetchLatestKillsPage).mock.calls.length;
    const lossesBefore = vi.mocked(fetchLatestLossesPage).mock.calls.length;

    const second = new Event("paste") as ClipboardEvent;
    Object.defineProperty(second, "clipboardData", {
      value: {
        getData: () => "  a9tan  "
      }
    });
    window.dispatchEvent(second);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vi.mocked(fetchLatestKillsPage).mock.calls.length).toBe(killsBefore);
    expect(vi.mocked(fetchLatestLossesPage).mock.calls.length).toBe(lossesBefore);
  });

  it("only starts fetch path for newly added pilots on repaste", async () => {
    render(<App />);

    const first = new Event("paste") as ClipboardEvent;
    Object.defineProperty(first, "clipboardData", {
      value: {
        getData: () => "A9tan"
      }
    });
    window.dispatchEvent(first);

    await waitFor(() => {
      expect(vi.mocked(fetchLatestKillsPage).mock.calls.some((call) => call[0] === 12345)).toBe(true);
      expect(vi.mocked(fetchLatestLossesPage).mock.calls.some((call) => call[0] === 12345)).toBe(true);
    });
    const killsAInitial = vi.mocked(fetchLatestKillsPage).mock.calls.filter((call) => call[0] === 12345).length;
    const lossesAInitial = vi.mocked(fetchLatestLossesPage).mock.calls.filter((call) => call[0] === 12345).length;

    const second = new Event("paste") as ClipboardEvent;
    Object.defineProperty(second, "clipboardData", {
      value: {
        getData: () => "A9tan\nB9tan"
      }
    });
    window.dispatchEvent(second);

    await waitFor(() => {
      expect(vi.mocked(fetchLatestKillsPage).mock.calls.some((call) => call[0] === 67890)).toBe(true);
      expect(vi.mocked(fetchLatestLossesPage).mock.calls.some((call) => call[0] === 67890)).toBe(true);
    });
    const killsAAfter = vi.mocked(fetchLatestKillsPage).mock.calls.filter((call) => call[0] === 12345).length;
    const lossesAAfter = vi.mocked(fetchLatestLossesPage).mock.calls.filter((call) => call[0] === 12345).length;
    expect(killsAAfter).toBe(killsAInitial);
    expect(lossesAAfter).toBe(lossesAInitial);
  });

  it("supports desktop clipboard callback ingestion", async () => {
    let clipboardHandler: ((text: string) => void) | undefined;
    (window as Window & { eveIntelDesktop?: unknown }).eveIntelDesktop = {
      onClipboardText(callback: (text: string) => void) {
        clipboardHandler = callback;
        return () => undefined;
      },
      isWindowMaximized: async () => false,
      onWindowMaximized: () => () => undefined,
      onUpdaterState: () => () => undefined,
      checkForUpdates: async () => ({ ok: true }),
      quitAndInstallUpdate: async () => true,
      minimizeWindow: async () => undefined,
      toggleMaximizeWindow: async () => false,
      closeWindow: async () => undefined
    };

    render(<App />);
    clipboardHandler?.("A9tan");

    await waitFor(() => {
      expect(screen.getAllByText("A9tan").length).toBeGreaterThan(0);
    });
  });
});
