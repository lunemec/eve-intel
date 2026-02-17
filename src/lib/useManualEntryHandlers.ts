import { useManualEntryChange } from "./useManualEntryChange";
import { useManualEntrySubmit } from "./useManualEntrySubmit";

export function useManualEntryHandlers(params: {
  manualEntry: string;
  setManualEntry: React.Dispatch<React.SetStateAction<string>>;
  applyPaste: (text: string) => void;
}): {
  onManualEntryChange: (value: string) => void;
  onManualEntrySubmit: () => void;
} {
  const onManualEntryChange = useManualEntryChange({ setManualEntry: params.setManualEntry });
  const onManualEntrySubmit = useManualEntrySubmit({ manualEntry: params.manualEntry, applyPaste: params.applyPaste });

  return {
    onManualEntryChange,
    onManualEntrySubmit
  };
}
