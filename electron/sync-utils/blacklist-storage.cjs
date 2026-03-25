const fs = require("node:fs");
const path = require("node:path");
const { buildPathId } = require("./path-id.cjs");

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
      const p = this._getPath(projectPath);
      if (!fs.existsSync(p)) return [];
      return JSON.parse(fs.readFileSync(p, "utf-8")) || [];
    } catch {
      return [];
    }
  }

  save(projectPath, entries) {
    const p = this._getPath(projectPath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(entries || [], null, 2), "utf-8");
  }
}

module.exports = { BlacklistStorage };
