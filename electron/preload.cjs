const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eveIntelDesktop", {
  onClipboardText(callback) {
    const listener = (_event, text) => callback(text);
    ipcRenderer.on("clipboard-text", listener);
    return () => ipcRenderer.removeListener("clipboard-text", listener);
  },
  minimizeWindow() {
    return ipcRenderer.invoke("window:minimize");
  },
  toggleMaximizeWindow() {
    return ipcRenderer.invoke("window:toggle-maximize");
  },
  closeWindow() {
    return ipcRenderer.invoke("window:close");
  },
  isWindowMaximized() {
    return ipcRenderer.invoke("window:is-maximized");
  },
  onWindowMaximized(callback) {
    const listener = (_event, value) => callback(Boolean(value));
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  }
});
