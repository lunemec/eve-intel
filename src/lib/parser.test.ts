import { describe, expect, it } from "vitest";
import { parseClipboardText } from "./parser";

describe("parseClipboardText", () => {
  it("parses pilot-only format", () => {
    const result = parseClipboardText("A9tan");
    expect(result.rejected).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      pilotName: "A9tan",
      shipSource: "inferred",
      parseConfidence: 0.9
    });
  });

  it("parses pilot+ship format", () => {
    const result = parseClipboardText("Ula (Charon)");
    expect(result.rejected).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      pilotName: "Ula",
      explicitShip: "Charon",
      shipSource: "explicit",
      parseConfidence: 0.98
    });
  });

  it("dedupes by pilot and prefers explicit ship entry", () => {
    const result = parseClipboardText("Ula\nUla (Charon)");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      pilotName: "Ula",
      explicitShip: "Charon",
      shipSource: "explicit"
    });
  });

  it("rejects malformed lines", () => {
    const result = parseClipboardText("**not a pilot**\nA9tan");
    expect(result.entries).toHaveLength(1);
    expect(result.rejected).toEqual(["**not a pilot**"]);
  });

  it("accepts unicode letters in pilot names", () => {
    const result = parseClipboardText("Łowca (Sunesis)");
    expect(result.rejected).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].pilotName).toBe("Łowca");
  });

  it("parses chat format and extracts target after >", () => {
    const result = parseClipboardText("[15:08:27] Fredy Redy > Luthien Tibuviel");
    expect(result.rejected).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      pilotName: "Luthien Tibuviel",
      shipSource: "inferred"
    });
  });

  it("parses multiple names from url tags after > in chat format", () => {
    const line =
      "[14:49:21] Fredy Redy > <url=showinfo:1377//2115173641>Artem Noir</url>  <url=showinfo:1378//2123829880>Bor O'dinsky</url>  <url=showinfo:1375//2123203479>Denis Bergamp</url>";
    const result = parseClipboardText(line);
    expect(result.rejected).toEqual([]);
    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => entry.pilotName)).toEqual([
      "Artem Noir",
      "Bor O'dinsky",
      "Denis Bergamp"
    ]);
  });
});
