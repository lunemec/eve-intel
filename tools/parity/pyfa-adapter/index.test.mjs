import { describe, expect, it } from "vitest";
import { normalizeEft, parsePyfaOutput } from "./index.mjs";

describe("pyfa adapter", () => {
  it("normalizes EFT module ordering", () => {
    const eft = `[Nergal, Test]\n\nB Module\nA Module`;
    const normalized = normalizeEft(eft);
    expect(normalized.shipName).toBe("Nergal");
    expect(normalized.normalized.split("\n")[1]).toBe("A Module");
  });

  it("parses pyfa JSON output into canonical schema", () => {
    const parsed = parsePyfaOutput(
      JSON.stringify({
        offense: { totalDps: 123.4, totalVolley: 250.5 },
        defense: {
          ehp: { total: 9999 },
          resists: {
            shield: { em: 0.1, therm: 0.2, kin: 0.3, exp: 0.4 },
            armor: { em: 0.5, therm: 0.6, kin: 0.7, exp: 0.8 },
            hull: { em: 0.9, therm: 0.9, kin: 0.9, exp: 0.9 }
          }
        }
      }),
      "fit-1",
      123,
      "test",
      "img"
    );

    expect(parsed.dpsTotal).toBe(123.4);
    expect(parsed.alpha).toBe(250.5);
    expect(parsed.ehp).toBe(9999);
    expect(parsed.resists.armor.exp).toBe(0.8);
  });

  it("parses svcfitstat envelope into canonical schema", () => {
    const parsed = parsePyfaOutput(
      JSON.stringify({
        success: true,
        stats: {
          offense: { totalDps: 77.7, totalVolley: 123.4 },
          defense: {
            ehp: { total: 4321.9 },
            resists: {
              shield: { em: 0.1, therm: 0.2, kin: 0.3, exp: 0.4 },
              armor: { em: 0.5, therm: 0.6, kin: 0.7, exp: 0.8 },
              hull: { em: 0.9, therm: 0.9, kin: 0.9, exp: 0.9 }
            }
          }
        }
      }),
      "fit-2",
      456,
      "test",
      "img"
    );

    expect(parsed.dpsTotal).toBe(77.7);
    expect(parsed.alpha).toBe(123.4);
    expect(parsed.ehp).toBe(4321.9);
    expect(parsed.metadata.envelope).toBe("svcfitstat");
  });
});
