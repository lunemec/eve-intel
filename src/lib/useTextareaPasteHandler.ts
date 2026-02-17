import { useCallback } from "react";

export function useTextareaPasteHandler(params: {
  applyPaste: (text: string) => void;
}): (event: React.ClipboardEvent<HTMLTextAreaElement>) => void {
  return useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData?.getData("text");
    if (text) {
      params.applyPaste(text);
    }
  }, [params.applyPaste]);
}
