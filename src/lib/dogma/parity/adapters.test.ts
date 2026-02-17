import { describe, expect, it } from "vitest";
import path from "node:path";
import { normalizeEft, parsePyfaOutput } from "../../../../tools/parity/pyfa-adapter/index.mjs";
import { parseSvcfitstatCallbackFixture } from "../../../../tools/parity/svcfitstat-replay/index.mjs";

describe("parity adapters", () => {
  it("normalizes EFT and parses pyfa output", () => {
    const normalized = normalizeEft(`[Nergal, Test]\n\nB Module\nA Module`);
    expect(normalized.normalized.split("\n")[1]).toBe("A Module");

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

    expect(parsed.ehp).toBe(9999);
  });

  it("normalizes EFT while ignoring slot section labels", () => {
    const normalized = normalizeEft(`[Sabre, Inferred 100%]

High Slots:
200mm AutoCannon II, Republic Fleet EMP S

Mid Slots:
Medium Shield Extender II

Low Slots:
Gyrostabilizer II

Rig Slots:
Small Core Defense Field Extender I`);

    expect(normalized.normalized).not.toContain("High Slots:");
    expect(normalized.normalized).not.toContain("Mid Slots:");
    expect(normalized.normalized).toContain("Medium Shield Extender II");
  });

  it("parses svcfitstat-style pyfa envelope output", () => {
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
  });

  it("parses pyfa stdout with warning prefix by extracting JSON tail", () => {
    const parsed = parsePyfaOutput(
      `Gtk-WARNING: noisy line\n{"offense":{"totalDps":11,"totalVolley":22},"defense":{"ehp":{"total":33},"resists":{"shield":{"em":0.1,"therm":0.2,"kin":0.3,"exp":0.4},"armor":{"em":0.5,"therm":0.6,"kin":0.7,"exp":0.8},"hull":{"em":0.9,"therm":0.9,"kin":0.9,"exp":0.9}}}}`,
      "fit-3",
      789,
      "test",
      "img"
    );
    expect(parsed.dpsTotal).toBe(11);
    expect(parsed.ehp).toBe(33);
  });

  it("maps svcfitstat callback fixture", async () => {
    const fixturePath = path.join(process.cwd(), "svcfitstat", "CALLBACK_EXAMPLE.md");
    const result = await parseSvcfitstatCallbackFixture({
      path: fixturePath,
      fitId: "nergal-svcfitstat",
      shipTypeId: 52250,
      sdeVersion: "fixture"
    });

    expect(result.dpsTotal).toBeCloseTo(398.48, 2);
    expect(result.resists.armor.therm).toBeCloseTo(0.868, 3);
  });
});
