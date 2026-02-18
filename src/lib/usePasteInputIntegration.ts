import { useGlobalPasteTrap } from "./useGlobalPasteTrap";
import { useTextareaPasteHandler } from "./useTextareaPasteHandler";

export function usePasteInputIntegration(params: {
  applyPaste: (text: string) => void;
}): {
  pasteTrapRef: React.RefObject<HTMLTextAreaElement>;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
} {
  const pasteTrapRef = useGlobalPasteTrap({ applyPaste: params.applyPaste });
  const onPaste = useTextareaPasteHandler({ applyPaste: params.applyPaste });

  return {
    pasteTrapRef,
    onPaste
  };
}
