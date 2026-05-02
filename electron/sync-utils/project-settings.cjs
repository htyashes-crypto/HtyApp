const fs = require("node:fs");
const path = require("node:path");
const { buildPathId } = require("./path-id.cjs");
const { writeAtomicWithBackup, readJsonWithBackup } = require("../tools-utils/atomic-json.cjs");

const DEFAULT_SETTINGS = {
  AutoSyncEnabled: false,
  AutoSyncIntervalMinutes: 30,
  AutoSyncMode: "RepoToProjectAll"
};

class ProjectSettingsStorage {
  constructor(appDataDir) {
    this.appDataDir = appDataDir;
  }

  _getPath(projectPath) {
    const folder = path.join(this.appDataDir, "HtyFrameworkSync", "Projects", buildPathId(projectPath));
    return path.join(folder, "settings.json");
  }

  load(projectPath) {
    try {
      const data = readJsonWithBackup(this._getPath(projectPath));
      if (data) return { ...DEFAULT_SETTINGS, ...data };
      return { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(projectPath, settings) {
    const p = this._getPath(projectPath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    writeAtomicWithBackup(p, JSON.stringify(settings, null, 2));
  }
}

module.exports = { ProjectSettingsStorage, DEFAULT_SETTINGS };
