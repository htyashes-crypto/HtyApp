const fs = require("node:fs");
const path = require("node:path");
const { buildPathId } = require("./path-id.cjs");

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
      const p = this._getPath(projectPath);
      if (!fs.existsSync(p)) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(p, "utf-8")) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(projectPath, settings) {
    const p = this._getPath(projectPath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf-8");
  }
}

module.exports = { ProjectSettingsStorage, DEFAULT_SETTINGS };
