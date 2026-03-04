import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GROUP_COLOR_TOKENS = [
  "fleet-group-color-0",
  "fleet-group-color-1",
  "fleet-group-color-2",
  "fleet-group-color-3",
  "fleet-group-color-4",
  "fleet-group-color-5"
];

function stylesheet(): string {
  return readFileSync(resolve(process.cwd(), "src", "styles.css"), "utf8");
}

describe("grouping palette stylesheet contract", () => {
  it("defines grouped surface selectors and deterministic group color tokens", () => {
    const styles = stylesheet();
    expect(styles).toContain(".fleet-summary-line.is-grouped");
    expect(styles).toContain(".pilot-card.is-grouped");
    expect(styles).toContain(".player-card.is-grouped");
    expect(styles).toContain("--group-accent:");
    expect(styles).toContain("--group-tint:");

    for (const token of GROUP_COLOR_TOKENS) {
      expect(styles).toContain(`[data-group-color-token="${token}"]`);
    }
  });

  it("defines greyed suggestion styling hooks for rows and cards", () => {
    const styles = stylesheet();
    expect(styles).toContain(".fleet-summary-line.is-suggested");
    expect(styles).toContain(".pilot-card.is-suggested");
    expect(styles).toContain(".player-card.is-suggested");
    expect(styles).toContain("opacity:");
  });
});
