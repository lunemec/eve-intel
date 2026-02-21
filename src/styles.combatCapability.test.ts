import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function stylesheet(): string {
  return readFileSync(resolve(process.cwd(), "src", "styles.css"), "utf8");
}

describe("combat capability stylesheet contract", () => {
  it("uses pyfa-aligned damage palette variables and class mappings", () => {
    const styles = stylesheet();
    expect(styles).toContain("--damage-em: #2685C6;");
    expect(styles).toContain("--damage-th: #C62626;");
    expect(styles).toContain("--damage-ki: #A3A3A3;");
    expect(styles).toContain("--damage-ex: #C68526;");
    expect(styles).toMatch(/\.damage-em\s*\{\s*color:\s*var\(--damage-em\);\s*\}/);
    expect(styles).toMatch(/\.damage-th\s*\{\s*color:\s*var\(--damage-th\);\s*\}/);
    expect(styles).toMatch(/\.damage-ki\s*\{\s*color:\s*var\(--damage-ki\);\s*\}/);
    expect(styles).toMatch(/\.damage-ex\s*\{\s*color:\s*var\(--damage-ex\);\s*\}/);
  });

  it("does not override all resist cell colors when tank row highlight is active", () => {
    const styles = stylesheet();
    expect(styles).not.toMatch(/\.ship-resist-row-warning\s+th,\s*\.ship-resist-row-warning\s+td\s*\{[^}]*color:/s);
  });
});
