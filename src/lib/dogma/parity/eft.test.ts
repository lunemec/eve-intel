import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildDogmaIndex } from "../index";
import type { DogmaPack } from "../types";
import { parseEftToResolvedFit } from "./eft";

const EFT = `[Nergal, Nergsdfasdfl fit]\n\nSmall Armor Repairer II\nAssault Damage Control II\nAdaptive Nano Plating II\nAdaptive Nano Plating II\n\nSmall Hull Repairer II\nSmall Shield Booster I\nSmall Compact Pb-Acid Cap Battery\n\nLight Entropic Disintegrator I, Tetryon Exotic Plasma S\n[Empty High slot]\n\nSmall Anti-Kinetic Pump I\nSmall Anti-Kinetic Pump I\n\nHobgoblin II x5`;
const SABRE_EFT_WITH_SECTION_HEADERS = `[Sabre, Inferred 100%]

High Slots:
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
200mm AutoCannon II,Republic Fleet EMP S
Interdiction Sphere Launcher I,Warp Disrupt Probe

Mid Slots:
5MN Y-T8 Compact Microwarpdrive
Faint Epsilon Scoped Warp Scrambler
Fleeting Compact Stasis Webifier
Medium Shield Extender II

Low Slots:
Gyrostabilizer II
Nanofiber Internal Structure II

Rig Slots:
Small Core Defense Field Extender I
Small Core Defense Field Extender I`;
const GILA_EFT_NO_HEADERS = `[Gila, Drone baseline]

Rapid Light Missile Launcher II, Caldari Navy Scourge Light Missile
Rapid Light Missile Launcher II, Caldari Navy Scourge Light Missile

10MN Y-S8 Compact Afterburner
Multispectrum Shield Hardener II

Drone Damage Amplifier II

Caldari Navy Vespa x4`;
const TENGU_EFT_WITH_SUBSYSTEMS = `[Tengu, Subsystem test]

Subsystems:
Tengu Offensive - Accelerated Ejection Bay
Tengu Defensive - Covert Reconfiguration
Tengu Core - Augmented Graviton Reactor
Tengu Propulsion - Fuel Catalyst

High Slots:
Heavy Assault Missile Launcher II
Heavy Assault Missile Launcher II`;
const TENGU_EFT_WITH_CARGO_MODULE = `[Tengu, Cargo module section]

High Slots:
Heavy Missile Launcher II

Cargo:
Large Shield Extender II`;

describe("parseEftToResolvedFit", () => {
  it("resolves renamed modules via aliasing", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) return;
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const parsed = parseEftToResolvedFit(index, EFT);
    expect(parsed.unknownLines).toEqual([]);
    expect(parsed.slots.low.length).toBeGreaterThanOrEqual(4);
    expect(parsed.slots.rig.length).toBeGreaterThanOrEqual(2);
  });

  it("parses explicit slot section headers correctly", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) return;
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const parsed = parseEftToResolvedFit(index, SABRE_EFT_WITH_SECTION_HEADERS);
    expect(parsed.unknownLines).toEqual([]);
    expect(parsed.slots.high.length).toBe(8);
    expect(parsed.slots.mid.length).toBe(4);
    expect(parsed.slots.low.length).toBe(2);
    expect(parsed.slots.rig.length).toBe(2);
  });

  it("infers slot family from module effects when headings are omitted", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) return;
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const parsed = parseEftToResolvedFit(index, GILA_EFT_NO_HEADERS);
    expect(parsed.unknownLines).toEqual([]);
    expect(parsed.slots.high.length).toBe(2);
    expect(parsed.slots.mid.length).toBe(2);
    expect(parsed.slots.low.length).toBe(1);
  });

  it("parses subsystem section lines into other slots", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) return;
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const parsed = parseEftToResolvedFit(index, TENGU_EFT_WITH_SUBSYSTEMS);
    expect(parsed.unknownLines).toEqual([]);
    expect(parsed.slots.other.length).toBe(4);
    expect(parsed.slots.high.length).toBe(2);
  });

  it("keeps cargo-section modules in cargo instead of inferring fitted slots", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    if (!existsSync(packPath)) return;
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);

    const parsed = parseEftToResolvedFit(index, TENGU_EFT_WITH_CARGO_MODULE);
    expect(parsed.unknownLines).toEqual([]);
    expect(parsed.slots.high.length).toBe(1);
    expect(parsed.slots.mid.length).toBe(0);
    expect(parsed.slots.cargo.some((m) => m.name === "Large Shield Extender II")).toBe(true);
  });

  it("resolves T3 subsystem lines from corpus fits", () => {
    const manifestPath = path.join(process.cwd(), "public", "data", "dogma-manifest.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { packFile: string };
    const packPath = path.join(process.cwd(), "public", "data", manifest.packFile);
    const corpusPath = path.join(process.cwd(), "data", "parity", "fit-corpus.jsonl");
    if (!existsSync(packPath) || !existsSync(corpusPath)) return;
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as DogmaPack;
    const index = buildDogmaIndex(pack);
    const corpus = readFileSync(corpusPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line)) as Array<{ fitId: string; eft: string }>;
    const loki = corpus.find((row) => row.fitId === "zkill-loki-133446334");
    if (!loki) return;

    const parsed = parseEftToResolvedFit(index, loki.eft);
    expect(parsed.unknownLines).toEqual([]);
    expect(parsed.slots.other.length).toBeGreaterThanOrEqual(4);
  });
});
