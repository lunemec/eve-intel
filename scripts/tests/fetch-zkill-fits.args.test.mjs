import { describe, expect, it } from "vitest";
import { parseFetchZkillFitsArgs } from "../lib/zkill-fit-fetch-cli/args.mjs";

describe("parseFetchZkillFitsArgs", () => {
  it("rejects non-array argv inputs", () => {
    expect(() => parseFetchZkillFitsArgs(null)).toThrowError(
      /CLI arguments must be provided as an array/
    );
  });

  it("requires --ship-type-ids", () => {
    expect(() => parseFetchZkillFitsArgs(["--output", "out.jsonl"])).toThrowError(
      /--ship-type-ids/
    );
  });

  it("parses numeric ship type ids", () => {
    const parsed = parseFetchZkillFitsArgs([
      "--ship-type-ids",
      "29984, 29986,29984",
      "--output",
      "out.jsonl"
    ]);

    expect(parsed.shipTypeIds).toEqual([29984, 29986]);
  });

  it("defaults --max-records to 200", () => {
    const parsed = parseFetchZkillFitsArgs([
      "--ship-type-ids",
      "29984",
      "--output",
      "out.jsonl"
    ]);

    expect(parsed.maxRecords).toBe(200);
  });

  it("rejects invalid --max-records values", () => {
    expect(() =>
      parseFetchZkillFitsArgs([
        "--ship-type-ids",
        "29984",
        "--max-records",
        "0",
        "--output",
        "out.jsonl"
      ])
    ).toThrowError(/--max-records/);
  });

  it("parses optional --before-killmail-id", () => {
    const parsed = parseFetchZkillFitsArgs([
      "--ship-type-ids",
      "29984",
      "--before-killmail-id",
      "123456",
      "--output",
      "out.jsonl"
    ]);

    expect(parsed.beforeKillmailId).toBe(123456);
  });

  it("requires --output", () => {
    expect(() => parseFetchZkillFitsArgs(["--ship-type-ids", "29984"])).toThrowError(/--output/);
  });
});
