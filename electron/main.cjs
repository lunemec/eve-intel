const path = require("node:path");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const { app, BrowserWindow, clipboard, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;
let clipboardInterval = null;
let lastClipboardText = "";
const devBaseUrl = process.env.VITE_DEV_SERVER_URL || "";
let updaterCheckInterval = null;
let updateDownloaded = false;
let quittingForInstall = false;
let updaterState = {
  status: "idle",
  progress: 0,
  version: app.getVersion(),
  availableVersion: null,
  downloadedVersion: null,
  error: null,
  errorDetails: null
};
const appIconPath =
  process.platform === "win32"
    ? path.join(__dirname, "..", "build", "icon.ico")
    : path.join(__dirname, "..", "build", "icon.png");
const parityFitDumpPath = path.join(process.cwd(), "data", "parity", "fit-corpus.dev.jsonl");
const parityFitDumpKeys = new Set();
let parityFitDumpLoaded = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    autoHideMenuBar: true,
    icon: appIconPath,
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
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    updateDownloaded = false;
    sendUpdaterState({ status: "checking", error: null, errorDetails: null, progress: 0 });
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdaterState({
      status: "downloading",
      progress: 0,
      error: null,
      errorDetails: null,
      availableVersion: info?.version ?? null
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdaterState({
      status: "downloading",
      progress: Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0))),
      error: null,
      errorDetails: null
    });
  });

  autoUpdater.on("update-not-available", () => {
    updateDownloaded = false;
    sendUpdaterState({
      status: "up-to-date",
      progress: 100,
      error: null,
      errorDetails: null,
      availableVersion: null,
      downloadedVersion: null
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    sendUpdaterState({
      status: "downloaded",
      progress: 100,
      error: null,
      errorDetails: null,
      downloadedVersion: info?.version ?? null
    });
  });

  autoUpdater.on("error", (error) => {
    const details = formatUpdaterError(error);
    sendUpdaterState({
      status: "error",
      error: error?.message ?? String(error),
      errorDetails: details,
      progress: 0
    });
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((error) => {
      const details = formatUpdaterError(error);
      sendUpdaterState({
        status: "error",
        error: error?.message ?? String(error),
        errorDetails: details,
        progress: 0
      });
    });
  }, 4000);

  updaterCheckInterval = setInterval(() => {
    void autoUpdater.checkForUpdates().catch((error) => {
      const details = formatUpdaterError(error);
      sendUpdaterState({
        status: "error",
        error: error?.message ?? String(error),
        errorDetails: details,
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
  if (process.platform === "win32") {
    app.setAppUserModelId("com.eveintel.app");
  }
  createWindow();
  startClipboardWatch();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", (event) => {
  if (isDev || !updateDownloaded || quittingForInstall) {
    return;
  }
  quittingForInstall = true;
  event.preventDefault();
  autoUpdater.quitAndInstall(true, false);
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
    const details = formatUpdaterError(error);
    const message = error?.message ?? String(error);
    sendUpdaterState({ status: "error", error: message, errorDetails: details, progress: 0 });
    return { ok: false, reason: message };
  }
});

ipcMain.handle("updater:quit-and-install", () => {
  if (isDev) {
    return false;
  }
  quittingForInstall = true;
  autoUpdater.quitAndInstall(true, true);
  return true;
});

ipcMain.handle("parity-fit-dump:append", async (_event, record) => {
  try {
    if (!record || typeof record !== "object") {
      return { ok: false, reason: "invalid-record" };
    }
    const key = String(record.key ?? "").trim();
    const shipTypeId = Number(record.shipTypeId);
    const eft = String(record.eft ?? "").trim();
    const shipName = String(record.shipName ?? "").trim();
    if (!key || !Number.isFinite(shipTypeId) || shipTypeId <= 0 || !eft) {
      return { ok: false, reason: "missing-required-fields" };
    }

    await ensureParityFitDumpLoaded();
    if (parityFitDumpKeys.has(key)) {
      return { ok: true, deduped: true, path: parityFitDumpPath };
    }

    const entry = {
      fitId: `dev-${key}`,
      shipTypeId,
      eft,
      origin: "manual",
      tags: inferTags(eft),
      devFitKey: key,
      shipName,
      sourceLossKillmailId: Number(record.sourceLossKillmailId ?? 0) || undefined,
      firstSeenAt: String(record.firstSeenAt ?? new Date().toISOString())
    };

    await fsPromises.mkdir(path.dirname(parityFitDumpPath), { recursive: true });
    await fsPromises.appendFile(parityFitDumpPath, `${JSON.stringify(entry)}\n`, "utf8");
    parityFitDumpKeys.add(key);
    return { ok: true, deduped: false, path: parityFitDumpPath };
  } catch (error) {
    return {
      ok: false,
      reason: error && error.message ? error.message : String(error)
    };
  }
});

async function ensureParityFitDumpLoaded() {
  if (parityFitDumpLoaded) {
    return;
  }
  parityFitDumpLoaded = true;
  if (!fs.existsSync(parityFitDumpPath)) {
    return;
  }
  const raw = await fsPromises.readFile(parityFitDumpPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const row = JSON.parse(trimmed);
      const key = String(row.devFitKey ?? "").trim();
      if (key) {
        parityFitDumpKeys.add(key);
      }
    } catch {
      // Ignore malformed historical rows.
    }
  }
}

function isInternalUrl(url) {
  if (!url) {
    return false;
  }
  if (isDev) {
    return url.startsWith(devBaseUrl);
  }
  return url.startsWith("file://");
}

function formatUpdaterError(error) {
  if (!error) {
    return null;
  }

  const fields = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    statusCode: error.statusCode,
    url: error.url,
    method: error.method,
    responseHeaders: error.responseHeaders
  };

  try {
    return JSON.stringify(fields, null, 2);
  } catch {
    return String(error);
  }
}

function inferTags(eft) {
  const lower = String(eft ?? "").toLowerCase();
  const tags = [];
  if (/(blaster|rail|hybrid)/.test(lower)) tags.push("hybrid-turret");
  if (/(autocannon|artillery|projectile)/.test(lower)) tags.push("projectile-turret");
  if (/(laser|beam|pulse)/.test(lower)) tags.push("laser-turret");
  if (/(launcher|missile|rocket|torpedo)/.test(lower)) tags.push("missile");
  if (/drone/.test(lower)) tags.push("drone-primary");
  if (/(shield|invulnerability|extender)/.test(lower)) tags.push("shield-tank");
  if (/(armor|plate|membrane)/.test(lower)) tags.push("armor-tank");
  return tags;
}
