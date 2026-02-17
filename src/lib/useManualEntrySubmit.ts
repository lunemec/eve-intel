import { useCallback } from "react";

export function useManualEntrySubmit(params: {
  manualEntry: string;
  applyPaste: (text: string) => void;
}): () => void {
  return useCallback(() => {
    params.applyPaste(params.manualEntry);
  }, [params.applyPaste, params.manualEntry]);
}
