import { useCallback } from "react";

export function useManualEntryHandlers(params: {
  manualEntry: string;
  setManualEntry: React.Dispatch<React.SetStateAction<string>>;
  applyPaste: (text: string) => void;
}): {
  onManualEntryChange: (value: string) => void;
  onManualEntrySubmit: () => void;
} {
  const onManualEntryChange = useCallback((value: string) => {
    params.setManualEntry(value);
  }, [params.setManualEntry]);
  const onManualEntrySubmit = useCallback(() => {
    params.applyPaste(params.manualEntry);
  }, [params.applyPaste, params.manualEntry]);

  return {
    onManualEntryChange,
    onManualEntrySubmit
  };
}
