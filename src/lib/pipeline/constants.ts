export const TOP_SHIP_CANDIDATES = 5;
export const DEEP_HISTORY_MAX_PAGES = 20;
export const PILOT_PROCESS_CONCURRENCY = 4;
export const ZKILL_PAGE_ROUND_CONCURRENCY = PILOT_PROCESS_CONCURRENCY;
export const ZKILL_PAGE_MAX_ROUNDS = DEEP_HISTORY_MAX_PAGES;
export const THREAT_PRIORITY_DANGER_THRESHOLD = 75;
export const THREAT_PRIORITY_HIGH_PAGE_WEIGHT = 2;
export const THREAT_PRIORITY_NORMAL_PAGE_WEIGHT = 1;

export function DEV_FIT_DUMP_ENABLED(): boolean {
  const isDesktopDumpAvailable =
    typeof window !== "undefined" && Boolean(window.eveIntelDesktop?.appendParityFitDump);
  return Boolean(import.meta.env?.DEV) || isDesktopDumpAvailable;
}
