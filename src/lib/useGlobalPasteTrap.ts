import { useEffect, useRef } from "react";

export function useGlobalPasteTrap(params: {
  applyPaste: (text: string) => void;
}): React.RefObject<HTMLTextAreaElement> {
  const pasteTrapRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text");
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

    window.addEventListener("paste", onPaste);
    window.addEventListener("focus", focusTrap);
    focusTrap();

    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("focus", focusTrap);
    };
  }, [params.applyPaste]);

  return pasteTrapRef;
}
