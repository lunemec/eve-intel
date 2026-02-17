export const TOP_SHIP_CANDIDATES = 5;
export const DEEP_HISTORY_MAX_PAGES = 20;
export const PILOT_PROCESS_CONCURRENCY = 4;
export const ZKILL_PAGE_ROUND_CONCURRENCY = PILOT_PROCESS_CONCURRENCY;
export const ZKILL_PAGE_MAX_ROUNDS = DEEP_HISTORY_MAX_PAGES;

export function DEV_FIT_DUMP_ENABLED(): boolean {
  const isDesktopDumpAvailable =
    typeof window !== "undefined" && Boolean(window.eveIntelDesktop?.appendParityFitDump);
  return Boolean(import.meta.env?.DEV) || isDesktopDumpAvailable;
}
