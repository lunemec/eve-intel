/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedStateAsync } from "./cache";
import { buildDevFitKey, persistDevFitRecord } from "./devFitDump";

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

describe("devFitDump", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-17T12:00:00Z"));
    vi.stubGlobal("localStorage", createMemoryStorage());
    delete window.eveIntelDesktop;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores one record for the same ship+eft payload", async () => {
    const eft = "[Drake, Test]\nHeavy Missile Launcher II";
    const key = buildDevFitKey("Drake", eft);
    const first = await persistDevFitRecord({ shipName: "Drake", shipTypeId: 24698, eft });
    const second = await persistDevFitRecord({ shipName: "Drake", shipTypeId: 24698, eft });
    const stored = await getCachedStateAsync<{ key: string; firstSeenAt: string }>(`eve-intel.dev-fit.record.${key}`);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(stored.value?.key).toBe(key);
    expect(stored.value?.firstSeenAt).toBe("2026-02-17T12:00:00.000Z");
  });

  it("stores different keys for different EFTs on the same ship", async () => {
    const eftA = "[Drake, A]\nHeavy Missile Launcher II";
    const eftB = "[Drake, B]\nRapid Heavy Missile Launcher II";
    const keyA = buildDevFitKey("Drake", eftA);
    const keyB = buildDevFitKey("Drake", eftB);

    await persistDevFitRecord({ shipName: "Drake", shipTypeId: 24698, eft: eftA });
    await persistDevFitRecord({ shipName: "Drake", shipTypeId: 24698, eft: eftB });

    const storedA = await getCachedStateAsync<{ key: string }>(`eve-intel.dev-fit.record.${keyA}`);
    const storedB = await getCachedStateAsync<{ key: string }>(`eve-intel.dev-fit.record.${keyB}`);
    expect(keyA).not.toBe(keyB);
    expect(storedA.value?.key).toBe(keyA);
    expect(storedB.value?.key).toBe(keyB);
  });

  it("stores different keys for different ships with same EFT body", async () => {
    const eft = "[Ship, Common]\nWarp Disruptor II";
    const keyA = buildDevFitKey("Onyx", eft);
    const keyB = buildDevFitKey("Broadsword", eft);

    await persistDevFitRecord({ shipName: "Onyx", shipTypeId: 12013, eft });
    await persistDevFitRecord({ shipName: "Broadsword", shipTypeId: 22456, eft });

    const storedA = await getCachedStateAsync<{ key: string }>(`eve-intel.dev-fit.record.${keyA}`);
    const storedB = await getCachedStateAsync<{ key: string }>(`eve-intel.dev-fit.record.${keyB}`);
    expect(keyA).not.toBe(keyB);
    expect(storedA.value?.key).toBe(keyA);
    expect(storedB.value?.key).toBe(keyB);
  });

  it("keeps first-seen timestamp when duplicate records arrive later", async () => {
    const eft = "[Eris, First]\nLight Neutron Blaster II";
    const key = buildDevFitKey("Eris", eft);

    await persistDevFitRecord({ shipName: "Eris", shipTypeId: 22460, eft });
    vi.setSystemTime(new Date("2026-02-17T12:30:00Z"));
    await persistDevFitRecord({ shipName: "Eris", shipTypeId: 22460, eft });

    const stored = await getCachedStateAsync<{ firstSeenAt: string }>(`eve-intel.dev-fit.record.${key}`);
    expect(stored.value?.firstSeenAt).toBe("2026-02-17T12:00:00.000Z");
  });

  it("forwards newly persisted records to desktop parity file sink when available", async () => {
    const appendParityFitDump = vi.fn(async () => ({ ok: true, deduped: false }));
    window.eveIntelDesktop = {
      appendParityFitDump,
      onClipboardText: () => () => undefined,
      minimizeWindow: async () => undefined,
      toggleMaximizeWindow: async () => false,
      closeWindow: async () => undefined,
      isWindowMaximized: async () => false,
      onWindowMaximized: () => () => undefined,
      onUpdaterState: () => () => undefined,
      checkForUpdates: async () => ({ ok: true }),
      quitAndInstallUpdate: async () => false
    };

    await persistDevFitRecord({
      shipName: "Drake",
      shipTypeId: 24698,
      eft: "[Drake, Test]\nHeavy Missile Launcher II"
    });

    expect(appendParityFitDump).toHaveBeenCalledTimes(1);
    expect(appendParityFitDump).toHaveBeenCalledWith(
      expect.objectContaining({
        shipName: "Drake",
        shipTypeId: 24698
      })
    );
  });
});
