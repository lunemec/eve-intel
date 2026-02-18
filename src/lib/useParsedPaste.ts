import { useCallback, useMemo, useState } from "react";
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
  const parseSignature = useMemo(() => buildParseSignature(parseResult), [parseResult]);

  const applyPaste = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const parsed = parseClipboardText(trimmed);
    setLastPasteRaw(trimmed);
    setManualEntry(trimmed);
    const nextSignature = buildParseSignature(parsed);
    if (nextSignature !== parseSignature) {
      setParseResult(parsed);
    }
    setLastPasteAt(new Date().toLocaleTimeString());
    params.logDebug(
      `Paste parsed: entries=${parsed.entries.length}, rejected=${parsed.rejected.length}`,
      parsed.rejected.length > 0 ? { rejected: parsed.rejected } : undefined
    );
  }, [params.logDebug, parseSignature]);

  return {
    lastPasteAt,
    lastPasteRaw,
    manualEntry,
    setManualEntry,
    parseResult,
    applyPaste
  };
}

function buildParseSignature(parsed: ParseResult): string {
  return parsed.entries
    .map((entry) => {
      const pilot = entry.pilotName.trim().toLowerCase();
      const ship = entry.explicitShip?.trim().toLowerCase() ?? "";
      return `${pilot}|${ship}`;
    })
    .join("||");
}
