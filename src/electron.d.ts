export {};

declare global {
  type DesktopUpdaterState = {
    status: "idle" | "dev" | "checking" | "downloading" | "up-to-date" | "downloaded" | "error";
    progress: number;
    version: string;
    availableVersion: string | null;
    downloadedVersion: string | null;
    error: string | null;
    errorDetails: string | null;
  };

  interface Window {
    eveIntelDesktop?: {
      onClipboardText: (callback: (text: string) => void) => () => void;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<void>;
      isWindowMaximized: () => Promise<boolean>;
      onWindowMaximized: (callback: (maximized: boolean) => void) => () => void;
      onUpdaterState: (callback: (state: DesktopUpdaterState) => void) => () => void;
      checkForUpdates: () => Promise<{ ok: boolean; reason?: string }>;
      quitAndInstallUpdate: () => Promise<boolean>;
    };
  }
}
