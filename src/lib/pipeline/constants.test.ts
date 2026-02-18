import { describe, expect, it } from "vitest";
import {
  DEEP_HISTORY_MAX_PAGES,
  DEV_FIT_DUMP_ENABLED,
  PILOT_PROCESS_CONCURRENCY,
  THREAT_PRIORITY_DANGER_THRESHOLD,
  THREAT_PRIORITY_HIGH_PAGE_WEIGHT,
  THREAT_PRIORITY_NORMAL_PAGE_WEIGHT,
  TOP_SHIP_CANDIDATES,
  ZKILL_PAGE_MAX_ROUNDS,
  ZKILL_PAGE_ROUND_CONCURRENCY
} from "./constants";

describe("pipeline/constants", () => {
  it("keeps stable default limits for pipeline stages", () => {
    expect(TOP_SHIP_CANDIDATES).toBe(5);
    expect(DEEP_HISTORY_MAX_PAGES).toBe(20);
    expect(PILOT_PROCESS_CONCURRENCY).toBe(4);
    expect(ZKILL_PAGE_ROUND_CONCURRENCY).toBe(PILOT_PROCESS_CONCURRENCY);
    expect(ZKILL_PAGE_MAX_ROUNDS).toBe(DEEP_HISTORY_MAX_PAGES);
    expect(THREAT_PRIORITY_DANGER_THRESHOLD).toBe(75);
    expect(THREAT_PRIORITY_HIGH_PAGE_WEIGHT).toBe(2);
    expect(THREAT_PRIORITY_NORMAL_PAGE_WEIGHT).toBe(1);
  });

  it("exposes dev fit dump helper as boolean-producing function", () => {
    expect(typeof DEV_FIT_DUMP_ENABLED()).toBe("boolean");
  });
});
