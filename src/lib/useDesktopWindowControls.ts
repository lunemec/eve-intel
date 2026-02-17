import { useCallback } from "react";

export function useDesktopWindowControls(): {
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  onRestartToUpdate: () => void;
} {
  const onMinimize = useCallback(() => {
    void window.eveIntelDesktop?.minimizeWindow();
  }, []);

  const onToggleMaximize = useCallback(() => {
    void window.eveIntelDesktop?.toggleMaximizeWindow();
  }, []);

  const onClose = useCallback(() => {
    void window.eveIntelDesktop?.closeWindow();
  }, []);

  const onRestartToUpdate = useCallback(() => {
    void window.eveIntelDesktop?.quitAndInstallUpdate();
  }, []);

  return {
    onMinimize,
    onToggleMaximize,
    onClose,
    onRestartToUpdate
  };
}
