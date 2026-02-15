const path = require("node:path");
const { app, BrowserWindow, clipboard, ipcMain, shell } = require("electron");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;
let clipboardInterval = null;
let lastClipboardText = "";
const devBaseUrl = process.env.VITE_DEV_SERVER_URL || "";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
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

app.whenReady().then(() => {
  createWindow();
  startClipboardWatch();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopClipboardWatch();
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

function isInternalUrl(url) {
  if (!url) {
    return false;
  }
  if (isDev) {
    return url.startsWith(devBaseUrl);
  }
  return url.startsWith("file://");
}
