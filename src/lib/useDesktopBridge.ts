import { useEffect, useRef, useState } from "react";
import { bindDesktopClipboard } from "./desktopBridge/clipboard";
import { buildUpdaterLogSignature, formatUpdaterLogEntry } from "./desktopBridge/updater";
import { bindWindowMaximizedListener } from "./desktopBridge/windowState";

type UseDesktopBridgeParams = {
  applyPaste: (text: string) => void;
  logDebug: (message: string, data?: unknown) => void;
};

type UseDesktopBridgeResult = {
  isDesktopApp: boolean;
  isWindowMaximized: boolean;
  updaterState: DesktopUpdaterState | null;
};

export function useDesktopBridge(params: UseDesktopBridgeParams): UseDesktopBridgeResult {
  const [isDesktopApp] = useState<boolean>(() => Boolean(window.eveIntelDesktop));
  const [isWindowMaximized, setIsWindowMaximized] = useState<boolean>(false);
  const [updaterState, setUpdaterState] = useState<DesktopUpdaterState | null>(null);
  const updaterLogSignatureRef = useRef<string>("");

  useEffect(() => {
    return bindDesktopClipboard(window.eveIntelDesktop, {
      applyPaste: params.applyPaste,
      logDebug: params.logDebug
    });
  }, [params.applyPaste, params.logDebug]);

  useEffect(() => {
    return bindWindowMaximizedListener(window.eveIntelDesktop, setIsWindowMaximized);
  }, []);

  useEffect(() => {
    if (!window.eveIntelDesktop?.onUpdaterState) {
      return;
    }

    const unsubscribe = window.eveIntelDesktop.onUpdaterState((state) => {
      setUpdaterState(state);
      const signature = buildUpdaterLogSignature(state);
      if (updaterLogSignatureRef.current === signature) {
        return;
      }
      updaterLogSignatureRef.current = signature;
      const logEntry = formatUpdaterLogEntry(state);
      if (logEntry) {
        params.logDebug(logEntry.message, logEntry.data);
      }
    });

    return unsubscribe;
  }, [params.logDebug]);

  return {
    isDesktopApp,
    isWindowMaximized,
    updaterState
  };
}
