const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { createDesktopService } = require("./service.cjs");
const { createSyncService } = require("./sync-service.cjs");
const { createToolsService } = require("./tools-service.cjs");
const { initAutoUpdater } = require("./updater.cjs");

const rendererUrl = process.env.ELECTRON_RENDERER_URL || null;
const useDevServer = Boolean(rendererUrl);
let mainWindow = null;
let service = null;
let syncService = null;
let toolsService = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    title: "HtyApp",
    icon: path.join(__dirname, "..", "build", "htyapp-icon.ico"),
    backgroundColor: "#11151b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[RENDERER] ${message} (${sourceId}:${line})`);
    }
  });

  if (useDevServer) {
    void mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function registerIpcHandlers() {
  ipcMain.handle("hty:invoke", async (_event, payload) => {
    if (!payload || typeof payload.command !== "string") {
      throw new Error("invalid desktop invoke payload");
    }

    try {
      if (payload.command.startsWith("sync_")) {
        return await syncService.invoke(payload.command, payload.args || {});
      }
      if (payload.command.startsWith("tasks_") || payload.command.startsWith("marks_")) {
        return await toolsService.invoke(payload.command, payload.args || {});
      }

      return await service.invoke(payload.command, payload.args || {});
    } catch (error) {
      console.error(`[MAIN] hty:invoke "${payload.command}" failed:`, error);
      throw error;
    }
  });

  ipcMain.handle("hty:get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("hty:dialog:open", async (_event, options) => {
    const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    const result = await dialog.showOpenDialog(targetWindow, {
      title: options?.title,
      defaultPath: options?.defaultPath || undefined,
      properties: [
        ...(options?.directory ? ["openDirectory"] : ["openFile"]),
        ...(options?.multiple ? ["multiSelections"] : [])
      ],
      filters: options?.filters
    });

    if (result.canceled) {
      return null;
    }

    if (options?.multiple) {
      return result.filePaths;
    }

    return result.filePaths[0] ?? null;
  });

  ipcMain.handle("hty:dialog:save", async (_event, options) => {
    const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    const result = await dialog.showSaveDialog(targetWindow, {
      title: options?.title,
      defaultPath: options?.defaultPath,
      filters: options?.filters
    });

    return result.canceled ? null : result.filePath ?? null;
  });
}

// Suppress DevTools Autofill CDP protocol errors (Autofill.enable / Autofill.setAddresses)
app.commandLine.appendSwitch("disable-features", "Autofill,AutofillServerCommunication");

process.on("uncaughtException", (error) => {
  console.error("[MAIN] uncaughtException:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[MAIN] unhandledRejection:", reason);
});

app.whenReady().then(() => {
  app.setName("HtySkillManager");
  service = createDesktopService({ defaultBaseDir: app.getPath("userData") });
  registerIpcHandlers();
  createWindow();

  const appDataDir = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  syncService = createSyncService({ appDataDir, mainWindow });
  toolsService = createToolsService({ appDataDir: app.getPath("userData") });

  if (!useDevServer) {
    initAutoUpdater(mainWindow);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
