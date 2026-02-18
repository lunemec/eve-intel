import type { PilotCard } from "./usePilotIntelPipeline";

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function aggregatePilotProgress(pilots: PilotCard[]): number {
  if (pilots.length === 0) {
    return 1;
  }
  const total = pilots.reduce((sum, pilot) => sum + pilotProgressWeight(pilot), 0);
  return Math.max(0.06, Math.min(1, total / pilots.length));
}

export function pilotProgressWeight(pilot: PilotCard): number {
  if (pilot.status === "error" || pilot.fetchPhase === "error") {
    return 1;
  }
  if (pilot.fetchPhase === "ready") {
    return 1;
  }
  if (pilot.fetchPhase === "enriching") {
    return 0.72;
  }
  if (pilot.status === "ready") {
    return 0.55;
  }
  return 0.2;
}

export function pilotDetailAnchorId(pilot: PilotCard): string {
  const stableKey = pilot.characterId
    ? `char-${pilot.characterId}`
    : pilot.parsedEntry.pilotName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `pilot-detail-${stableKey}`;
}

export function smoothScrollToElement(element: HTMLElement, durationMs: number): void {
  const startY = window.scrollY;
  const targetY = startY + element.getBoundingClientRect().top;
  const delta = targetY - startY;
  if (Math.abs(delta) < 2) {
    return;
  }

  const start = performance.now();
  const duration = Math.max(40, durationMs);
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    window.scrollTo(0, startY + delta * easeOutCubic(progress));
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}
