import { useCallback } from "react";

export function useCacheWipeAction(params: {
  clearCache: () => Promise<void>;
  logDebug: (message: string, data?: unknown) => void;
  setNetworkNotice: (value: string) => void;
  clearPilotCards: () => void;
  applyPaste: (text: string) => void;
  lastPasteRaw: string;
  manualEntry: string;
}): () => Promise<void> {
  return useCallback(async () => {
    await params.clearCache();
    params.logDebug("Cache wiped by user");
    params.setNetworkNotice("Cache wiped.");
    const payload = (params.lastPasteRaw || params.manualEntry).trim();
    if (payload) {
      params.applyPaste(payload);
    } else {
      params.clearPilotCards();
    }
  }, [
    params.clearCache,
    params.logDebug,
    params.setNetworkNotice,
    params.clearPilotCards,
    params.applyPaste,
    params.lastPasteRaw,
    params.manualEntry
  ]);
}
