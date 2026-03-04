import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function stylesheet(): string {
  return readFileSync(resolve(process.cwd(), "src", "styles.css"), "utf8");
}

describe("app shell sizing stylesheet contract", () => {
  it("keeps the widened app shell max-width for grouped combat layout", () => {
    const styles = stylesheet();
    expect(styles).toContain("max-width: 1120px;");
  });
});
