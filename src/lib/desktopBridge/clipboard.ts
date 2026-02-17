type ClipboardDeps = {
  applyPaste: (text: string) => void;
  logDebug: (message: string, data?: unknown) => void;
};

export function bindDesktopClipboard(
  desktop: Window["eveIntelDesktop"],
  deps: ClipboardDeps
): (() => void) | undefined {
  if (!desktop?.onClipboardText) {
    return undefined;
  }

  return desktop.onClipboardText((text) => {
    deps.applyPaste(text);
    deps.logDebug("Desktop clipboard update received");
  });
}
