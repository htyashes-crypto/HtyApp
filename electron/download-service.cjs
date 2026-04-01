const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { shell } = require("electron");
const { DownloadStorage } = require("./download-utils/download-storage.cjs");
const { DownloadWorker, probeUrlAsync } = require("./download-utils/download-worker.cjs");

function createDownloadService({ appDataDir, mainWindow }) {
  return new DownloadService(appDataDir, mainWindow);
}

class DownloadService {
  constructor(appDataDir, mainWindow) {
    this.storage = new DownloadStorage(appDataDir);
    this.mainWindow = mainWindow;
    this.activeDownloads = new Map();
    this.downloadQueue = [];
  }

  async invoke(command, args = {}) {
    switch (command) {
      case "dl_list":
        return this.storage.listItems();
      case "dl_create":
        return this._createDownload(args);
      case "dl_pause":
        return this._pauseDownload(args.id);
      case "dl_resume":
        return this._resumeDownload(args.id);
      case "dl_cancel":
        return this._cancelDownload(args.id);
      case "dl_delete":
        return this._deleteDownload(args.id, args.deleteFile);
      case "dl_retry":
        return this._retryDownload(args.id);
      case "dl_pause_all":
        return this._pauseAll();
      case "dl_resume_all":
        return this._resumeAll();
      case "dl_clear_completed":
        return this.storage.clearCompleted();
      case "dl_get_settings":
        return this.storage.getSettings();
      case "dl_save_settings":
        return this.storage.saveSettings(args.settings);
      case "dl_open_file":
        return shell.openPath(args.filePath);
      case "dl_reveal_file":
        shell.showItemInFolder(args.filePath);
        return;
      default:
        throw new Error(`unknown download command: ${command}`);
    }
  }

  async _createDownload({ url, fileName, savePath, segmentCount }) {
    const settings = this.storage.getSettings();
    const probe = await probeUrlAsync(url);

    const finalFileName = fileName || probe.fileName;
    const finalSavePath = savePath || path.join(settings.defaultSaveDir, finalFileName);
    const finalSegmentCount = segmentCount || settings.defaultSegmentCount;

    // Ensure save directory exists
    const saveDir = path.dirname(finalSavePath);
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    // Build segments
    const segments = [];
    if (probe.resumable && probe.totalBytes > 1024 * 1024 && finalSegmentCount > 1) {
      const segSize = Math.floor(probe.totalBytes / finalSegmentCount);
      for (let i = 0; i < finalSegmentCount; i++) {
        const startByte = i * segSize;
        const endByte = i === finalSegmentCount - 1 ? probe.totalBytes - 1 : (i + 1) * segSize - 1;
        segments.push({ index: i, startByte, endByte, downloadedBytes: 0 });
      }
    } else {
      segments.push({ index: 0, startByte: 0, endByte: Math.max(probe.totalBytes - 1, 0), downloadedBytes: 0 });
    }

    const item = {
      id: randomUUID(),
      url,
      fileName: finalFileName,
      savePath: finalSavePath,
      totalBytes: probe.totalBytes,
      downloadedBytes: 0,
      status: settings.autoStartDownloads ? "pending" : "paused",
      segments,
      segmentCount: segments.length,
      speed: 0,
      createdAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      mimeType: probe.mimeType,
      resumable: probe.resumable
    };

    this.storage.addItem(item);

    if (settings.autoStartDownloads) {
      this._enqueue(item.id);
    }

    return item;
  }

  _enqueue(id) {
    const settings = this.storage.getSettings();
    if (this.activeDownloads.size < settings.maxConcurrentDownloads) {
      this._startWorker(id);
    } else {
      this.downloadQueue.push(id);
    }
  }

  _startWorker(id) {
    const items = this.storage.listItems();
    const item = items.find((i) => i.id === id);
    if (!item) return;

    this.storage.updateItem(id, { status: "downloading", error: null });

    const worker = new DownloadWorker({
      item,
      onProgress: (progress) => {
        this._sendEvent("hty:dl:progress", progress);
      },
      onComplete: (progress) => {
        this.activeDownloads.delete(id);
        this.storage.updateItem(id, {
          status: "completed",
          downloadedBytes: progress.downloadedBytes,
          segments: progress.segments,
          speed: 0,
          completedAt: new Date().toISOString()
        });
        this._sendEvent("hty:dl:complete", { id });
        this._processQueue();
      },
      onError: (errId, message) => {
        this.activeDownloads.delete(errId);
        this.storage.updateItem(errId, {
          status: "failed",
          error: message,
          speed: 0
        });
        this._sendEvent("hty:dl:error", { id: errId, error: message });
        this._processQueue();
      }
    });

    this.activeDownloads.set(id, worker);
    worker.start();
  }

  _pauseDownload(id) {
    const worker = this.activeDownloads.get(id);
    if (worker) {
      const segBytes = worker.getSegmentBytes();
      worker.pause();
      this.activeDownloads.delete(id);

      const item = this.storage.listItems().find((i) => i.id === id);
      if (item) {
        const segments = item.segments.map((seg, i) => ({
          ...seg,
          downloadedBytes: segBytes[i] || seg.downloadedBytes
        }));
        const totalDownloaded = segBytes.reduce((a, b) => a + b, 0);
        this.storage.updateItem(id, {
          status: "paused",
          segments,
          downloadedBytes: totalDownloaded,
          speed: 0
        });
      }

      this._processQueue();
    } else {
      // Might be in queue
      this.downloadQueue = this.downloadQueue.filter((qid) => qid !== id);
      this.storage.updateItem(id, { status: "paused", speed: 0 });
    }
  }

  _resumeDownload(id) {
    const item = this.storage.listItems().find((i) => i.id === id);
    if (!item) throw new Error(`download not found: ${id}`);
    if (item.status !== "paused" && item.status !== "failed") return;

    this.storage.updateItem(id, { status: "pending", error: null });
    this._enqueue(id);
  }

  _cancelDownload(id) {
    const worker = this.activeDownloads.get(id);
    if (worker) {
      worker.cancel();
      this.activeDownloads.delete(id);
      this._processQueue();
    } else {
      this.downloadQueue = this.downloadQueue.filter((qid) => qid !== id);
    }

    this.storage.updateItem(id, { status: "cancelled", speed: 0 });
  }

  _deleteDownload(id, deleteFile) {
    const item = this.storage.listItems().find((i) => i.id === id);

    // Stop if active
    const worker = this.activeDownloads.get(id);
    if (worker) {
      worker.cancel();
      this.activeDownloads.delete(id);
      this._processQueue();
    }
    this.downloadQueue = this.downloadQueue.filter((qid) => qid !== id);

    if (deleteFile && item && item.savePath) {
      try { fs.unlinkSync(item.savePath); } catch {}
      // Also clean temp files
      if (item.segments) {
        for (let i = 0; i < item.segments.length; i++) {
          try { fs.unlinkSync(item.savePath + `.part${i}`); } catch {}
        }
      }
    }

    this.storage.removeItem(id);
  }

  _retryDownload(id) {
    const item = this.storage.listItems().find((i) => i.id === id);
    if (!item) throw new Error(`download not found: ${id}`);

    // Reset segments
    const segments = item.segments.map((seg) => ({ ...seg, downloadedBytes: 0 }));
    this.storage.updateItem(id, {
      status: "pending",
      downloadedBytes: 0,
      segments,
      error: null,
      speed: 0,
      completedAt: null
    });

    // Clean temp files
    for (let i = 0; i < segments.length; i++) {
      try { fs.unlinkSync(item.savePath + `.part${i}`); } catch {}
    }

    this._enqueue(id);
  }

  _pauseAll() {
    const ids = [...this.activeDownloads.keys()];
    for (const id of ids) {
      this._pauseDownload(id);
    }
    // Also pause queued items
    for (const id of this.downloadQueue) {
      this.storage.updateItem(id, { status: "paused", speed: 0 });
    }
    this.downloadQueue = [];
  }

  _resumeAll() {
    const items = this.storage.listItems();
    for (const item of items) {
      if (item.status === "paused") {
        this.storage.updateItem(item.id, { status: "pending", error: null });
        this._enqueue(item.id);
      }
    }
  }

  _processQueue() {
    const settings = this.storage.getSettings();
    while (this.downloadQueue.length > 0 && this.activeDownloads.size < settings.maxConcurrentDownloads) {
      const nextId = this.downloadQueue.shift();
      // Verify item still exists and is pending
      const item = this.storage.listItems().find((i) => i.id === nextId);
      if (item && item.status === "pending") {
        this._startWorker(nextId);
      }
    }
  }

  _sendEvent(channel, data) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data);
      }
    } catch { /* ignore */ }
  }
}

module.exports = { createDownloadService };
