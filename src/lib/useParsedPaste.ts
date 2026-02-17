import { useCallback, useState } from "react";
import type { ParseResult } from "../types";
import { parseClipboardText } from "./parser";

export function useParsedPaste(params: {
  logDebug: (message: string, data?: unknown) => void;
}): {
  lastPasteAt: string;
  lastPasteRaw: string;
  manualEntry: string;
  setManualEntry: React.Dispatch<React.SetStateAction<string>>;
  parseResult: ParseResult;
  applyPaste: (text: string) => void;
} {
  const [lastPasteAt, setLastPasteAt] = useState<string>("Never");
  const [lastPasteRaw, setLastPasteRaw] = useState<string>("");
  const [manualEntry, setManualEntry] = useState<string>("");
  const [parseResult, setParseResult] = useState<ParseResult>({ entries: [], rejected: [] });

  const applyPaste = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const parsed = parseClipboardText(trimmed);
    setLastPasteRaw(trimmed);
    setManualEntry(trimmed);
    setParseResult(parsed);
    setLastPasteAt(new Date().toLocaleTimeString());
    params.logDebug(
      `Paste parsed: entries=${parsed.entries.length}, rejected=${parsed.rejected.length}`,
      parsed.rejected.length > 0 ? { rejected: parsed.rejected } : undefined
    );
  }, [params.logDebug]);

  return {
    lastPasteAt,
    lastPasteRaw,
    manualEntry,
    setManualEntry,
    parseResult,
    applyPaste
  };
}
