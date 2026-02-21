import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REQUIRED_COMBAT_ICON_ASSETS = [
  "public/icons/damage/em_big.png",
  "public/icons/damage/thermal_big.png",
  "public/icons/damage/kinetic_big.png",
  "public/icons/damage/explosive_big.png"
];

describe("combat icon asset contract", () => {
  it("ships required local pyfa combat icons", () => {
    for (const relativePath of REQUIRED_COMBAT_ICON_ASSETS) {
      expect(existsSync(resolve(process.cwd(), relativePath)), `missing asset ${relativePath}`).toBe(true);
    }
  });
});
