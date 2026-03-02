import { useCallback, useEffect, useRef } from "react";

function readClipboardText(clipboardData: DataTransfer | null | undefined): string | null {
  const text = clipboardData?.getData("text");
  return text ? text : null;
}

export function usePasteInputIntegration(params: {
  applyPaste: (text: string) => void;
}): {
  pasteTrapRef: React.RefObject<HTMLTextAreaElement>;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
} {
  const pasteTrapRef = useRef<HTMLTextAreaElement>(null);
  const lastHandledPasteEventRef = useRef<Event | null>(null);
  const onPaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    lastHandledPasteEventRef.current = event.nativeEvent ?? null;
    // The same DOM paste event can otherwise be observed by this handler and the window listener.
    event.stopPropagation?.();
    const text = readClipboardText(event.clipboardData);
    if (text) {
      params.applyPaste(text);
    }
  }, [params.applyPaste]);

  useEffect(() => {
    const onWindowPaste = (event: ClipboardEvent) => {
      if (event === lastHandledPasteEventRef.current) {
        lastHandledPasteEventRef.current = null;
        return;
      }
      const text = readClipboardText(event.clipboardData);
      if (text) {
        params.applyPaste(text);
      }
    };
    const focusTrap = () => {
      const active = document.activeElement;
      if (active === pasteTrapRef.current) {
        return;
      }
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
      ) {
        return;
      }
      pasteTrapRef.current?.focus();
    };

    window.addEventListener("paste", onWindowPaste);
    window.addEventListener("focus", focusTrap);
    focusTrap();

    return () => {
      window.removeEventListener("paste", onWindowPaste);
      window.removeEventListener("focus", focusTrap);
    };
  }, [params.applyPaste]);

  return {
    pasteTrapRef,
    onPaste
  };
}
