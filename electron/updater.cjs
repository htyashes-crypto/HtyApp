const { autoUpdater } = require("electron-updater");
const { ipcMain, net } = require("electron");

let mainWindow = null;

function sendUpdateStatus(type, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("hty:update-status", { type, ...data });
  }
}

function initAutoUpdater(win) {
  mainWindow = win;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus("checking");
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus("available", {
      version: info.version,
      releaseNotes: info.releaseNotes
    });
    fetchRemoteChangelog(info.version);
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdateStatus("not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus("downloading", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateStatus("downloaded", {
      version: info.version
    });
  });

  autoUpdater.on("error", (error) => {
    sendUpdateStatus("error", {
      message: error?.message || "Unknown error"
    });
  });

  // IPC handlers
  ipcMain.handle("hty:check-update", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo ?? null;
    } catch (error) {
      console.error("[UPDATER] check failed:", error);
      return null;
    }
  });

  ipcMain.handle("hty:download-update", async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error("[UPDATER] download failed:", error);
      throw error;
    }
  });

  ipcMain.handle("hty:quit-and-install", () => {
    autoUpdater.quitAndInstall();
  });

  // Check for updates after a short delay on startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[UPDATER] initial check failed:", err);
    });
  }, 3000);
}

function fetchRemoteChangelog(version) {
  const tag = `v${version}`;
  const url = `https://raw.githubusercontent.com/htyashes-crypto/HtyApp/${tag}/changelog.json`;
  const request = net.request(url);
  let body = "";
  request.on("response", (response) => {
    if (response.statusCode !== 200) return;
    response.on("data", (chunk) => { body += chunk.toString(); });
    response.on("end", () => {
      try {
        const entries = JSON.parse(body);
        sendUpdateStatus("changelog", { changelog: entries });
      } catch {
        // ignore parse errors
      }
    });
  });
  request.on("error", () => {
    // silent fail — changelog is optional
  });
  request.end();
}

module.exports = { initAutoUpdater };
