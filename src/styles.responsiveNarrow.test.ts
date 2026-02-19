import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function stylesheet(): string {
  return readFileSync(resolve(process.cwd(), "src", "styles.css"), "utf8");
}

function findResponsiveBlocks(styles: string): {
  block1060: string;
  block860: string;
  block770: string;
  block480: string;
} {
  const media1060 = styles.indexOf("@media (max-width: 1060px)");
  const media860 = styles.indexOf("@media (max-width: 860px)");
  const media770 = styles.indexOf("@media (max-width: 770px)");
  const media700 = styles.indexOf("@media (max-width: 700px)");
  const media480 = styles.indexOf("@media (max-width: 480px)");
  expect(media1060).toBeGreaterThan(-1);
  expect(media860).toBeGreaterThan(-1);
  expect(media770).toBeGreaterThan(-1);
  expect(media700).toBeGreaterThan(-1);
  expect(media480).toBeGreaterThan(-1);
  expect(media1060).toBeLessThan(media860);
  expect(media860).toBeLessThan(media770);
  expect(media770).toBeLessThan(media700);
  expect(media700).toBeLessThan(media480);
  return {
    block1060: styles.slice(media1060, media860),
    block860: styles.slice(media860, media770),
    block770: styles.slice(media770, media700),
    block480: styles.slice(media480)
  };
}

describe("responsive narrow-width stylesheet contract", () => {
  it("hides combat capability container and secondary fleet ship at <=1060px", () => {
    const { block1060 } = findResponsiveBlocks(stylesheet());
    expect(block1060).toContain(".ship-metrics");
    expect(block1060).toContain("display: none;");
    expect(block1060).toContain(".ship-fit-and-metrics");
    expect(block1060).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(block1060).toContain(".fleet-col-ship-secondary");
    expect(block1060).toContain(".fleet-summary-grid");
    expect(block1060).toContain(
      "grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.68fr) minmax(0, 1.3fr);"
    );
    expect(block1060).toContain(".stat-label");
    expect(block1060).toContain("white-space: normal;");
  });

  it("hides fleet alliance column and switches to four fleet columns at <=860px", () => {
    const { block860 } = findResponsiveBlocks(stylesheet());
    expect(block860).toContain(".fleet-col-alliance");
    expect(block860).toContain("display: none;");
    expect(block860).toContain(".fleet-summary-grid");
    expect(block860).toContain(
      "grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr) minmax(0, 1.68fr) minmax(0, 1.3fr);"
    );
  });

  it("hides ship-column container at <=770px and keeps fleet three-column reduction", () => {
    const { block770 } = findResponsiveBlocks(stylesheet());
    expect(block770).toContain(".pilot-card");
    expect(block770).toContain("grid-template-columns: 1fr;");
    expect(block770).toContain(".player-card");
    expect(block770).toContain("max-width: none;");
    expect(block770).toContain("justify-self: stretch;");
    expect(block770).toContain(".ship-column");
    expect(block770).toContain("display: none;");
    expect(block770).toContain(".ship-fit-and-metrics");
    expect(block770).toContain("display: none;");
    expect(block770).toContain(".fit-copy-button");
    expect(block770).toContain(".fleet-col-corporation");
    expect(block770).toContain(".fleet-summary-grid");
    expect(block770).toContain(
      "grid-template-columns: minmax(0, 1.9fr) minmax(0, 1.68fr) minmax(0, 1.3fr);"
    );
  });

  it("keeps <=480px single-column fleet layout block after progressive narrow breakpoints", () => {
    const { block480 } = findResponsiveBlocks(stylesheet());
    expect(block480).toContain(".fleet-summary-grid");
    expect(block480).toContain(".fleet-summary-line");
    expect(block480).toContain("grid-template-columns: 1fr;");
  });
});
