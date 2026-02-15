export {};

declare global {
  interface Window {
    eveIntelDesktop?: {
      onClipboardText: (callback: (text: string) => void) => () => void;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<void>;
      isWindowMaximized: () => Promise<boolean>;
      onWindowMaximized: (callback: (maximized: boolean) => void) => () => void;
    };
  }
}
