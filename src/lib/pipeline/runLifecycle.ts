import type { ParsedPilotInput } from "../../types";
import { toPilotKey } from "./pilotIdentity";

export type PilotRunMode = "interactive" | "background";

export type ActivePilotRun = {
  pilotKey: string;
  entry: ParsedPilotInput;
  abortController: AbortController;
  mode: PilotRunMode;
  cancel: () => void;
};

type PendingPilotRun = {
  entry: ParsedPilotInput;
  mode: PilotRunMode;
};

type LaunchPilotRun = (params: {
  entry: ParsedPilotInput;
  mode: PilotRunMode;
  abortController: AbortController;
  isCancelled: () => boolean;
}) => Promise<void>;

export function requestPilotRun(params: {
  entry: ParsedPilotInput;
  mode: PilotRunMode;
  queueIfActive: boolean;
  activeByPilotKey: Map<string, ActivePilotRun>;
  pendingByPilotKey: Map<string, PendingPilotRun>;
  launchRun: LaunchPilotRun;
}): boolean {
  const pilotKey = toPilotKey(params.entry.pilotName);
  if (params.activeByPilotKey.has(pilotKey)) {
    if (params.queueIfActive) {
      params.pendingByPilotKey.set(pilotKey, {
        entry: params.entry,
        mode: params.mode
      });
    }
    return false;
  }

  launchPilotRun({
    entry: params.entry,
    mode: params.mode,
    pilotKey,
    activeByPilotKey: params.activeByPilotKey,
    pendingByPilotKey: params.pendingByPilotKey,
    launchRun: params.launchRun
  });

  return true;
}

export function cancelPilotRun(params: {
  pilotKey: string;
  activeByPilotKey: Map<string, ActivePilotRun>;
  pendingByPilotKey: Map<string, PendingPilotRun>;
}): void {
  const active = params.activeByPilotKey.get(params.pilotKey);
  if (active) {
    active.cancel();
    params.activeByPilotKey.delete(params.pilotKey);
  }
  params.pendingByPilotKey.delete(params.pilotKey);
}

export function cancelAllPilotRuns(params: {
  activeByPilotKey: Map<string, ActivePilotRun>;
  pendingByPilotKey: Map<string, PendingPilotRun>;
}): void {
  for (const active of params.activeByPilotKey.values()) {
    active.cancel();
  }
  params.activeByPilotKey.clear();
  params.pendingByPilotKey.clear();
}

function launchPilotRun(params: {
  entry: ParsedPilotInput;
  mode: PilotRunMode;
  pilotKey: string;
  activeByPilotKey: Map<string, ActivePilotRun>;
  pendingByPilotKey: Map<string, PendingPilotRun>;
  launchRun: LaunchPilotRun;
}): void {
  const abortController = new AbortController();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    abortController.abort();
  };

  params.activeByPilotKey.set(params.pilotKey, {
    pilotKey: params.pilotKey,
    entry: params.entry,
    abortController,
    mode: params.mode,
    cancel
  });

  void params.launchRun({
    entry: params.entry,
    mode: params.mode,
    abortController,
    isCancelled: () => cancelled
  }).finally(() => {
    const current = params.activeByPilotKey.get(params.pilotKey);
    if (!current || current.abortController !== abortController) {
      return;
    }
    params.activeByPilotKey.delete(params.pilotKey);

    const pending = params.pendingByPilotKey.get(params.pilotKey);
    if (!pending) {
      return;
    }
    params.pendingByPilotKey.delete(params.pilotKey);
    launchPilotRun({
      entry: pending.entry,
      mode: pending.mode,
      pilotKey: params.pilotKey,
      activeByPilotKey: params.activeByPilotKey,
      pendingByPilotKey: params.pendingByPilotKey,
      launchRun: params.launchRun
    });
  });
}
