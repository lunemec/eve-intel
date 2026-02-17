import { useEffect, useRef, useState } from "react";

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
    if (!window.eveIntelDesktop?.onClipboardText) {
      return;
    }

    const unsubscribe = window.eveIntelDesktop.onClipboardText((text) => {
      params.applyPaste(text);
      params.logDebug("Desktop clipboard update received");
    });
    return unsubscribe;
  }, [params.applyPaste, params.logDebug]);

  useEffect(() => {
    if (!window.eveIntelDesktop) {
      return;
    }

    let mounted = true;
    void window.eveIntelDesktop.isWindowMaximized().then((value) => {
      if (mounted) {
        setIsWindowMaximized(value);
      }
    });

    const unsubscribe = window.eveIntelDesktop.onWindowMaximized((value) => {
      setIsWindowMaximized(value);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!window.eveIntelDesktop?.onUpdaterState) {
      return;
    }

    const unsubscribe = window.eveIntelDesktop.onUpdaterState((state) => {
      setUpdaterState(state);
      const signature = `${state.status}|${state.progress}|${state.availableVersion}|${state.downloadedVersion}|${state.error}|${state.errorDetails ?? ""}`;
      if (updaterLogSignatureRef.current === signature) {
        return;
      }
      updaterLogSignatureRef.current = signature;

      if (state.status === "error") {
        params.logDebug("Updater error", {
          message: state.error,
          details: state.errorDetails
        });
        return;
      }

      if (
        state.status === "checking" ||
        state.status === "downloading" ||
        state.status === "downloaded" ||
        state.status === "up-to-date"
      ) {
        params.logDebug("Updater state", {
          status: state.status,
          progress: state.progress,
          availableVersion: state.availableVersion,
          downloadedVersion: state.downloadedVersion
        });
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
