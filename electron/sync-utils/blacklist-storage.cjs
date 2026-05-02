const fs = require("node:fs");
const path = require("node:path");
const { buildPathId } = require("./path-id.cjs");
const { writeAtomicWithBackup, readJsonWithBackup } = require("../tools-utils/atomic-json.cjs");

class BlacklistStorage {
  constructor(appDataDir) {
    this.appDataDir = appDataDir;
  }

  _getPath(projectPath) {
    const folder = path.join(this.appDataDir, "HtyFrameworkSync", "Projects", buildPathId(projectPath));
    return path.join(folder, "blacklist.json");
  }

  load(projectPath) {
    try {
      return readJsonWithBackup(this._getPath(projectPath)) || [];
    } catch {
      return [];
    }
  }

  save(projectPath, entries) {
    const p = this._getPath(projectPath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    writeAtomicWithBackup(p, JSON.stringify(entries || [], null, 2));
  }
}

module.exports = { BlacklistStorage };
