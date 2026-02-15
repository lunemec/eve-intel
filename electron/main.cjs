const path = require("node:path");
const { app, BrowserWindow, clipboard, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;
let clipboardInterval = null;
let lastClipboardText = "";
const devBaseUrl = process.env.VITE_DEV_SERVER_URL || "";
let updaterCheckInterval = null;
let updaterState = {
  status: "idle",
  progress: 0,
  version: app.getVersion(),
  availableVersion: null,
  downloadedVersion: null,
  error: null
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.setMenuBarVisibility(false);
  if (typeof mainWindow.removeMenu === "function") {
    mainWindow.removeMenu();
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) {
      return;
    }
    event.preventDefault();
    void shell.openExternal(url);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximized", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximized", false);
  });

  mainWindow.webContents.once("did-finish-load", () => {
    sendUpdaterState(updaterState);
  });
}

function startClipboardWatch() {
  stopClipboardWatch();
  clipboardInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    const text = clipboard.readText().trim();
    if (!text || text === lastClipboardText) {
      return;
    }
    lastClipboardText = text;
    mainWindow.webContents.send("clipboard-text", text);
  }, 450);
}

function stopClipboardWatch() {
  if (clipboardInterval) {
    clearInterval(clipboardInterval);
    clipboardInterval = null;
  }
}

function sendUpdaterState(next) {
  updaterState = { ...updaterState, ...next };
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("updater:state", updaterState);
}

function setupAutoUpdater() {
  if (isDev) {
    sendUpdaterState({ status: "dev", error: null, progress: 0 });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdaterState({ status: "checking", error: null, progress: 0 });
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdaterState({
      status: "downloading",
      progress: 0,
      error: null,
      availableVersion: info?.version ?? null
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdaterState({
      status: "downloading",
      progress: Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0))),
      error: null
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdaterState({
      status: "up-to-date",
      progress: 100,
      error: null,
      availableVersion: null,
      downloadedVersion: null
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdaterState({
      status: "downloaded",
      progress: 100,
      error: null,
      downloadedVersion: info?.version ?? null
    });
  });

  autoUpdater.on("error", (error) => {
    sendUpdaterState({
      status: "error",
      error: error?.message ?? String(error),
      progress: 0
    });
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((error) => {
      sendUpdaterState({
        status: "error",
        error: error?.message ?? String(error),
        progress: 0
      });
    });
  }, 4000);

  updaterCheckInterval = setInterval(() => {
    void autoUpdater.checkForUpdates().catch((error) => {
      sendUpdaterState({
        status: "error",
        error: error?.message ?? String(error),
        progress: 0
      });
    });
  }, 1000 * 60 * 30);
}

function stopAutoUpdater() {
  if (updaterCheckInterval) {
    clearInterval(updaterCheckInterval);
    updaterCheckInterval = null;
  }
}

app.whenReady().then(() => {
  createWindow();
  startClipboardWatch();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopClipboardWatch();
  stopAutoUpdater();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.on("clipboard-watch:reset", () => {
  lastClipboardText = "";
});

ipcMain.handle("window:minimize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.minimize();
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.handle("window:close", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.close();
});

ipcMain.handle("window:is-maximized", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  return mainWindow.isMaximized();
});

ipcMain.handle("updater:check-now", async () => {
  if (isDev) {
    sendUpdaterState({ status: "dev", progress: 0 });
    return { ok: false, reason: "dev" };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    const message = error?.message ?? String(error);
    sendUpdaterState({ status: "error", error: message, progress: 0 });
    return { ok: false, reason: message };
  }
});

ipcMain.handle("updater:quit-and-install", () => {
  if (isDev) {
    return false;
  }
  autoUpdater.quitAndInstall(false, true);
  return true;
});

function isInternalUrl(url) {
  if (!url) {
    return false;
  }
  if (isDev) {
    return url.startsWith(devBaseUrl);
  }
  return url.startsWith("file://");
}
