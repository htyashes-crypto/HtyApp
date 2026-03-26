const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { Worker } = require("node:worker_threads");
const { shell } = require("electron");
const { ProjectStorage } = require("./sync-utils/project-storage.cjs");
const { BlacklistStorage } = require("./sync-utils/blacklist-storage.cjs");
const { TemplateStorage } = require("./sync-utils/template-storage.cjs");
const { ProjectSettingsStorage } = require("./sync-utils/project-settings.cjs");
const { SyncStateStorage } = require("./sync-utils/sync-state-storage.cjs");
const { SyncLogStorage } = require("./sync-utils/sync-log-storage.cjs");
const { FilterSchemeStorage } = require("./sync-utils/filter-scheme-storage.cjs");
const { syncFolder, copyFileOverwrite, deleteFileSafe, normalizeRel } = require("./sync-utils/file-sync.cjs");
const { readTextSafe } = require("./sync-utils/diff-engine.cjs");

class SyncService {
  constructor({ appDataDir, mainWindow }) {
    this.appDataDir = appDataDir;
    this.mainWindow = mainWindow;
    this.projectStorage = new ProjectStorage(appDataDir);
    this.blacklistStorage = new BlacklistStorage(appDataDir);
    this.templateStorage = new TemplateStorage(appDataDir);
    this.settingsStorage = new ProjectSettingsStorage(appDataDir);
    this.stateStorage = new SyncStateStorage(appDataDir);
    this.logStorage = new SyncLogStorage(appDataDir);
    this.filterSchemeStorage = new FilterSchemeStorage(appDataDir);
    this.autoSyncTimers = new Map();
    this._diffWorker = null;
  }

  async invoke(command, args) {
    switch (command) {
      // Project & Repository management
      case "sync_load_projects":
        return this.projectStorage.load();
      case "sync_save_projects":
        this.projectStorage.save(args.data);
        return;

      // Repository CRUD
      case "sync_add_repository": {
        const data = this.projectStorage.load();
        const id = crypto.randomUUID();
        data.Repositories.push({
          Id: id,
          Name: args.name,
          RepositoryPath: args.repoPath || "",
          Projects: []
        });
        this.projectStorage.save(data);
        return { id };
      }
      case "sync_remove_repository": {
        const data = this.projectStorage.load();
        data.Repositories = data.Repositories.filter((r) => r.Id !== args.repoId);
        this.projectStorage.save(data);
        return;
      }
      case "sync_rename_repository": {
        const data = this.projectStorage.load();
        const repo = data.Repositories.find((r) => r.Id === args.repoId);
        if (!repo) throw new Error(`Repository not found`);
        repo.Name = args.newName;
        this.projectStorage.save(data);
        return;
      }
      case "sync_set_repository_path": {
        const data = this.projectStorage.load();
        const repo = data.Repositories.find((r) => r.Id === args.repoId);
        if (!repo) throw new Error(`Repository not found`);
        repo.RepositoryPath = args.repoPath;
        this.projectStorage.save(data);
        return;
      }

      // Project CRUD (scoped to repository)
      case "sync_add_project": {
        const data = this.projectStorage.load();
        const repo = data.Repositories.find((r) => r.Id === args.repoId);
        if (!repo) throw new Error(`Repository not found`);
        if (repo.Projects.some((p) => p.Name === args.name))
          throw new Error(`Project "${args.name}" already exists`);
        repo.Projects.push({ Name: args.name, Path: args.path });
        this.projectStorage.save(data);
        return;
      }
      case "sync_remove_project": {
        const data = this.projectStorage.load();
        const repo = data.Repositories.find((r) => r.Id === args.repoId);
        if (!repo) throw new Error(`Repository not found`);
        repo.Projects = repo.Projects.filter((p) => p.Name !== args.name);
        this.projectStorage.save(data);
        return;
      }
      case "sync_rename_project": {
        const data = this.projectStorage.load();
        const repo = data.Repositories.find((r) => r.Id === args.repoId);
        if (!repo) throw new Error(`Repository not found`);
        const proj = repo.Projects.find((p) => p.Name === args.oldName);
        if (!proj) throw new Error(`Project "${args.oldName}" not found`);
        if (repo.Projects.some((p) => p.Name === args.newName))
          throw new Error(`Project "${args.newName}" already exists`);
        proj.Name = args.newName;
        this.projectStorage.save(data);
        return;
      }

      // Diff / Sync
      case "sync_compute_diffs": {
        const { projectRoot, repoRoot, syncMode, blacklistDirs, ...filterOpts } = args;
        return this._computeDiffsInWorker({ projectRoot, repoRoot, syncMode, blacklistDirs }, filterOpts);
      }
      case "sync_folder": {
        const { sourceDir, targetDir, mode, verifyContent, blacklist, projectPath, repoPath, operation, direction } = args;
        const changes = [];
        const summary = syncFolder(sourceDir, targetDir, mode, verifyContent, blacklist, changes);

        // Update sync state after sync
        const baseStates = this.stateStorage.load(projectPath, repoPath);
        const { loadCache, getOrComputeHash, saveCache } = require("./sync-utils/file-hash-cache.cjs");
        const targetCache = loadCache(this.appDataDir, targetDir);
        for (const change of changes) {
          const fullPath = path.join(targetDir, change.path);
          if (fs.existsSync(fullPath)) {
            const hash = getOrComputeHash(change.path, fullPath, targetCache);
            baseStates[change.path.toLowerCase()] = {
              RelativePath: change.path,
              BaseExists: true,
              BaseHash: hash,
              UpdatedAt: new Date().toISOString()
            };
          } else {
            delete baseStates[change.path.toLowerCase()];
          }
        }
        saveCache(this.appDataDir, targetDir, targetCache);
        this.stateStorage.save(projectPath, repoPath, baseStates);

        // Log
        const logEntry = {
          LogId: require("node:crypto").randomUUID().replace(/-/g, ""),
          Time: new Date().toISOString(),
          ProjectPath: projectPath,
          RepositoryPath: repoPath,
          Operation: operation || "sync",
          Direction: direction || "unknown",
          Mode: mode,
          Copied: summary.copied,
          Overwritten: summary.overwritten,
          Deleted: summary.deleted,
          Result: "success",
          Message: `Copied: ${summary.copied}, Overwritten: ${summary.overwritten}, Deleted: ${summary.deleted}`
        };
        const logChanges = changes.map((c) => ({ Path: c.path, Action: c.action }));
        this.logStorage.appendWithDetails(logEntry, logChanges);

        return summary;
      }
      case "sync_bulk_sync": {
        const { entries, projectRoot, repoRoot, direction, blacklist } = args;
        const summary = { copied: 0, overwritten: 0, deleted: 0 };
        const total = entries.length;
        let done = 0;
        const changes = [];
        for (const rel of entries) {
          const projFile = path.join(projectRoot, rel);
          const repoFile = path.join(repoRoot, rel);
          const src = direction === "RepoToProject" ? repoFile : projFile;
          const dst = direction === "RepoToProject" ? projFile : repoFile;

          if (fs.existsSync(src)) {
            if (fs.existsSync(dst)) {
              copyFileOverwrite(src, dst);
              summary.overwritten++;
              changes.push({ path: rel, action: "Overwritten" });
            } else {
              copyFileOverwrite(src, dst);
              summary.copied++;
              changes.push({ path: rel, action: "Copied" });
            }
          } else if (fs.existsSync(dst)) {
            deleteFileSafe(dst);
            summary.deleted++;
            changes.push({ path: rel, action: "Deleted" });
          }
          done++;
          if ((done & 7) === 0) {
            this._sendEvent("hty:sync:bulk-progress", { done, total });
          }
        }
        this._sendEvent("hty:sync:bulk-progress", { done: total, total });

        // Log
        const logEntry = {
          LogId: require("node:crypto").randomUUID().replace(/-/g, ""),
          Time: new Date().toISOString(),
          ProjectPath: projectRoot,
          RepositoryPath: repoRoot,
          Operation: "bulk_sync",
          Direction: direction,
          Mode: "selected",
          Copied: summary.copied,
          Overwritten: summary.overwritten,
          Deleted: summary.deleted,
          Result: "success",
          Message: `Copied: ${summary.copied}, Overwritten: ${summary.overwritten}, Deleted: ${summary.deleted}`
        };
        const logChanges = changes.map((c) => ({ Path: c.path, Action: c.action }));
        this.logStorage.appendWithDetails(logEntry, logChanges);

        return summary;
      }

      // Blacklist
      case "sync_load_blacklist":
        return this.blacklistStorage.load(args.projectPath);
      case "sync_save_blacklist":
        this.blacklistStorage.save(args.projectPath, args.entries);
        return;

      // Templates
      case "sync_load_templates":
        return this.templateStorage.load();
      case "sync_save_templates":
        this.templateStorage.save(args.templates);
        return;
      case "sync_import_templates":
        return this.templateStorage.importFromFile(args.filePath);
      case "sync_export_templates":
        this.templateStorage.exportToFile(args.filePath, args.templates);
        return;

      // Project settings
      case "sync_load_project_settings":
        return this.settingsStorage.load(args.projectPath);
      case "sync_save_project_settings":
        this.settingsStorage.save(args.projectPath, args.settings);
        return;

      // Sync logs
      case "sync_load_sync_logs":
        return this.logStorage.loadForProject(args.projectPath);
      case "sync_load_sync_log_details":
        return this.logStorage.loadDetails(args.logId);

      // Filter schemes
      case "sync_load_filter_schemes":
        return this.filterSchemeStorage.load();
      case "sync_save_filter_schemes":
        this.filterSchemeStorage.save(args.schemes);
        return;

      // Auto-sync
      case "sync_start_auto_sync": {
        const { projectPath, repoPath, intervalMinutes, mode } = args;
        this.stopAutoSync(projectPath);
        const interval = Math.max(1, intervalMinutes) * 60 * 1000;
        const timer = setInterval(() => {
          this._runAutoSync(projectPath, repoPath, mode);
        }, interval);
        this.autoSyncTimers.set(projectPath, timer);
        return;
      }
      case "sync_stop_auto_sync":
        this.stopAutoSync(args.projectPath);
        return;

      // Scan control
      case "sync_cancel_scan":
        this._cancelDiffWorker();
        return;

      // Utilities
      case "sync_open_in_explorer":
        shell.openPath(args.path);
        return;
      case "sync_open_file":
        shell.openPath(args.filePath);
        return;
      case "sync_reveal_file":
        shell.showItemInFolder(args.filePath);
        return;
      case "sync_read_file_text":
        return readTextSafe(args.filePath);
      case "sync_read_diff_texts": {
        const projPath = path.join(args.projectRoot, args.relativePath);
        const repoPath2 = path.join(args.repoRoot, args.relativePath);
        const projExists = fs.existsSync(projPath);
        const repoExists = fs.existsSync(repoPath2);
        return {
          projectText: projExists ? readTextSafe(projPath) : null,
          repoText: repoExists ? readTextSafe(repoPath2) : null,
          projectPath: projPath,
          repoPath: repoPath2,
          projectExists: projExists,
          repoExists: repoExists
        };
      }

      default:
        throw new Error(`Unknown sync command: ${command}`);
    }
  }

  _cancelDiffWorker() {
    if (this._diffWorker) {
      this._diffWorker.terminate();
      this._diffWorker = null;
    }
  }

  _computeDiffsInWorker(request, filterOptions) {
    // 终止之前正在运行的扫描 Worker，避免多个扫描竞争进度事件
    this._cancelDiffWorker();

    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, "sync-utils", "diff-worker.cjs");
      const worker = new Worker(workerPath, {
        workerData: { appDataDir: this.appDataDir, request, filterOptions }
      });
      this._diffWorker = worker;

      worker.on("message", (msg) => {
        if (worker !== this._diffWorker) return; // 已被新扫描替代，忽略消息
        if (msg.type === "progress") {
          this._sendEvent("hty:sync:scan-progress", { done: msg.done, total: msg.total });
        } else if (msg.type === "done") {
          this._diffWorker = null;
          resolve(msg.result);
        } else if (msg.type === "error") {
          this._diffWorker = null;
          reject(new Error(msg.message));
        }
      });

      worker.on("error", (err) => {
        if (worker === this._diffWorker) this._diffWorker = null;
        reject(err);
      });
      worker.on("exit", (code) => {
        if (code !== 0 && worker === this._diffWorker) {
          this._diffWorker = null;
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }

  stopAutoSync(projectPath) {
    const timer = this.autoSyncTimers.get(projectPath);
    if (timer) {
      clearInterval(timer);
      this.autoSyncTimers.delete(projectPath);
    }
  }

  _runAutoSync(projectPath, repoPath, mode) {
    try {
      let sourceDir, targetDir, direction, syncMode;
      if (mode === "RepoToProjectAll" || mode === "RepoToProjectScripts") {
        sourceDir = repoPath;
        targetDir = projectPath;
        direction = "RepoToProject";
        syncMode = mode.includes("Scripts") ? "Script" : "All";
      } else {
        sourceDir = projectPath;
        targetDir = repoPath;
        direction = "ProjectToRepo";
        syncMode = mode.includes("Scripts") ? "Script" : "All";
      }

      const blacklist = this.blacklistStorage.load(projectPath);
      const changes = [];
      const summary = syncFolder(sourceDir, targetDir, syncMode, false, blacklist, changes);

      const logEntry = {
        LogId: require("node:crypto").randomUUID().replace(/-/g, ""),
        Time: new Date().toISOString(),
        ProjectPath: projectPath,
        RepositoryPath: repoPath,
        Operation: "auto_sync",
        Direction: direction,
        Mode: syncMode,
        Copied: summary.copied,
        Overwritten: summary.overwritten,
        Deleted: summary.deleted,
        Result: "success",
        Message: `Auto-sync: Copied: ${summary.copied}, Overwritten: ${summary.overwritten}, Deleted: ${summary.deleted}`
      };
      const logChanges = changes.map((c) => ({ Path: c.path, Action: c.action }));
      this.logStorage.appendWithDetails(logEntry, logChanges);

      this._sendEvent("hty:sync:auto-sync-complete", { projectPath, summary });
    } catch (err) {
      this._sendEvent("hty:sync:notification", { title: "Auto-sync failed", message: err.message, level: "error" });
    }
  }

  _sendEvent(channel, data) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data);
      }
    } catch { /* ignore */ }
  }

  dispose() {
    for (const timer of this.autoSyncTimers.values()) {
      clearInterval(timer);
    }
    this.autoSyncTimers.clear();
  }
}

function createSyncService(options) {
  return new SyncService(options);
}

module.exports = { createSyncService };
