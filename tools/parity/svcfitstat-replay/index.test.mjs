import { describe, expect, it } from "vitest";
import path from "node:path";
import { parseSvcfitstatCallbackFixture } from "./index.mjs";

describe("svcfitstat replay", () => {
  it("maps callback fixture to parity result", async () => {
    const fixturePath = path.join(process.cwd(), "svcfitstat", "CALLBACK_EXAMPLE.md");
    const result = await parseSvcfitstatCallbackFixture({
      path: fixturePath,
      fitId: "nergal-svcfitstat",
      shipTypeId: 52250,
      sdeVersion: "fixture"
    });

    expect(result.dpsTotal).toBeCloseTo(398.48, 2);
    expect(result.alpha).toBeCloseTo(584.67, 2);
    expect(result.ehp).toBeGreaterThan(9000);
    expect(result.resists.armor.therm).toBeCloseTo(0.868, 3);
  });
});
