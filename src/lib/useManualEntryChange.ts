import { useCallback } from "react";

export function useManualEntryChange(params: {
  setManualEntry: React.Dispatch<React.SetStateAction<string>>;
}): (value: string) => void {
  return useCallback((value: string) => {
    params.setManualEntry(value);
  }, [params.setManualEntry]);
}
