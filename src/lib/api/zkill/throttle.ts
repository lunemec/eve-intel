/**
 * Global zkill request throttle.
 *
 * zkill rate-limits by stripping CORS headers, so the browser sees
 * net::ERR_FAILED and we lose all data.  This module serialises outgoing
 * zkill requests with a configurable concurrency and adaptive spacing to
 * stay well below the undocumented limit.
 *
 * Spacing scales with fleet size: small fleets (1-3 pilots) run fast,
 * large fleets (15+) space requests further apart to avoid rate limits.
 *
 * ESI requests are NOT throttled here — ESI has a generous 3600/15 min
 * budget and its own explicit rate-limit headers.
 */

const ZKILL_MAX_CONCURRENT = 2;
const ZKILL_BASE_SPACING_MS = 80;
const ZKILL_PER_PILOT_SPACING_MS = 5;
const ZKILL_MAX_SPACING_MS = 250;

let configuredPilotCount = 1;

/** Call at pipeline start so the throttle can adapt spacing to fleet size. */
export function setThrottleFleetSize(pilotCount: number): void {
  configuredPilotCount = Math.max(1, pilotCount);
}

function getSpacingMs(): number {
  return Math.min(
    ZKILL_MAX_SPACING_MS,
    ZKILL_BASE_SPACING_MS + configuredPilotCount * ZKILL_PER_PILOT_SPACING_MS
  );
}

export type ThrottleDebugEvent = {
  event: "enqueue" | "dispatch" | "complete" | "error" | "drain-delayed";
  queueDepth: number;
  running: number;
  waitMs?: number;
  durationMs?: number;
  label?: string;
  error?: string;
  spacingMs?: number;
};

let debugListener: ((event: ThrottleDebugEvent) => void) | null = null;

export function setThrottleDebugListener(listener: ((event: ThrottleDebugEvent) => void) | null): void {
  debugListener = listener;
}

function emitDebug(event: ThrottleDebugEvent): void {
  debugListener?.(event);
}

type QueueEntry<T> = {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  label?: string;
  enqueuedAt: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const queue: QueueEntry<any>[] = [];
let running = 0;
let lastDispatchedAt = 0;
let totalDispatched = 0;

function drain(): void {
  while (queue.length > 0 && running < ZKILL_MAX_CONCURRENT) {
    const spacingMs = getSpacingMs();
    const elapsed = Date.now() - lastDispatchedAt;
    if (elapsed < spacingMs) {
      const delayMs = spacingMs - elapsed;
      emitDebug({ event: "drain-delayed", queueDepth: queue.length, running, waitMs: delayMs, spacingMs });
      setTimeout(drain, delayMs);
      return;
    }

    const entry = queue.shift()!;
    running += 1;
    lastDispatchedAt = Date.now();
    totalDispatched += 1;
    const dispatchedAt = lastDispatchedAt;
    const waitMs = dispatchedAt - entry.enqueuedAt;

    emitDebug({
      event: "dispatch",
      queueDepth: queue.length,
      running,
      waitMs,
      label: entry.label,
      spacingMs
    });

    entry
      .fn()
      .then(
        (value) => {
          emitDebug({
            event: "complete",
            queueDepth: queue.length,
            running: running - 1,
            durationMs: Date.now() - dispatchedAt,
            label: entry.label
          });
          entry.resolve(value);
        },
        (error) => {
          emitDebug({
            event: "error",
            queueDepth: queue.length,
            running: running - 1,
            durationMs: Date.now() - dispatchedAt,
            label: entry.label,
            error: error instanceof Error ? error.message : String(error)
          });
          entry.reject(error);
        }
      )
      .finally(() => {
        running -= 1;
        drain();
      });
  }
}

/**
 * Enqueue an async function to run within the zkill rate-limit budget.
 * Returns a promise that resolves/rejects with the function's result.
 */
export function throttleZkill<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  const enqueuedAt = Date.now();
  emitDebug({ event: "enqueue", queueDepth: queue.length + 1, running, label });
  return new Promise<T>((resolve, reject) => {
    queue.push({ fn, resolve, reject, label, enqueuedAt });
    drain();
  });
}

/** Snapshot of throttle internal state for diagnostics. */
export function getThrottleStats(): { queueDepth: number; running: number; totalDispatched: number; spacingMs: number; pilotCount: number } {
  return { queueDepth: queue.length, running, totalDispatched, spacingMs: getSpacingMs(), pilotCount: configuredPilotCount };
}

/**
 * Clear all pending (not yet dispatched) entries from the queue.
 * Call this when the pipeline is cancelled (e.g., new paste) so stale
 * requests don't waste throttle budget.  Already-running requests are
 * not affected — they will complete or abort via their AbortSignal.
 */
export function clearThrottleQueue(): number {
  const cleared = queue.length;
  for (const entry of queue.splice(0)) {
    entry.reject(new DOMException("Throttle queue cleared", "AbortError"));
  }
  return cleared;
}

/** Reset internal state — for tests only. */
export function _resetThrottleForTesting(): void {
  queue.length = 0;
  running = 0;
  lastDispatchedAt = 0;
  totalDispatched = 0;
  configuredPilotCount = 1;
}
