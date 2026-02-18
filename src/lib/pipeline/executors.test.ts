import { describe, expect, it, vi } from "vitest";
import { ensureExplicitShipTypeId } from "./executors";
import { resolveInventoryTypeIdByName } from "../api/esi";
import type { ShipPrediction } from "../intel";

vi.mock("../api/esi", () => ({
  resolveInventoryTypeIdByName: vi.fn()
}));

describe("pipeline executors", () => {
  it("skips lookup when no explicit ship is provided", async () => {
    const predictedShips: ShipPrediction[] = [{ shipName: "Drake", source: "inferred", probability: 50, reason: [] }];
    await ensureExplicitShipTypeId({
      predictedShips,
      parsedEntry: {
        pilotName: "Pilot A",
        sourceLine: "Pilot A",
        parseConfidence: 1,
        shipSource: "inferred"
      },
      signal: undefined,
      onRetry: () => () => undefined,
      logDebug: vi.fn()
    });
    expect(resolveInventoryTypeIdByName).not.toHaveBeenCalled();
  });

  it("resolves explicit ship type id for explicit source row", async () => {
    vi.mocked(resolveInventoryTypeIdByName).mockResolvedValue(24698);
    const predictedShips: ShipPrediction[] = [{ shipName: "Drake", source: "explicit", probability: 100, reason: [], shipTypeId: undefined }];
    await ensureExplicitShipTypeId({
      predictedShips,
      parsedEntry: {
        pilotName: "Pilot A",
        explicitShip: "Drake",
        sourceLine: "Pilot A (Drake)",
        parseConfidence: 1,
        shipSource: "explicit"
      },
      signal: undefined,
      onRetry: () => () => undefined,
      logDebug: vi.fn()
    });
    expect(predictedShips[0].shipTypeId).toBe(24698);
  });
});
