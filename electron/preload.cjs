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
  },
  onUpdaterState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("updater:state", listener);
    return () => ipcRenderer.removeListener("updater:state", listener);
  },
  checkForUpdates() {
    return ipcRenderer.invoke("updater:check-now");
  },
  quitAndInstallUpdate() {
    return ipcRenderer.invoke("updater:quit-and-install");
  },
  appendParityFitDump(record) {
    return ipcRenderer.invoke("parity-fit-dump:append", record);
  }
});
