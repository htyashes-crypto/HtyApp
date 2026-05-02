const fs = require("node:fs");
const path = require("node:path");
const { buildPathId } = require("./path-id.cjs");
const { writeAtomicWithBackup, readJsonWithBackup } = require("../tools-utils/atomic-json.cjs");

class SyncStateStorage {
  constructor(appDataDir) {
    this.appDataDir = appDataDir;
  }

  _getPath(projectPath, repoPath) {
    const projectId = buildPathId(projectPath || "");
    const repoId = buildPathId(repoPath || "");
    const folder = path.join(this.appDataDir, "HtyFrameworkSync", "Projects", projectId);
    return path.join(folder, `sync_state.json.${repoId}.json`);
  }

  load(projectPath, repoPath) {
    try {
      const list = readJsonWithBackup(this._getPath(projectPath, repoPath)) || [];
      const map = {};
      for (const item of list) {
        if (item && item.RelativePath) {
          map[item.RelativePath.toLowerCase()] = item;
        }
      }
      return map;
    } catch {
      return {};
    }
  }

  save(projectPath, repoPath, states) {
    const p = this._getPath(projectPath, repoPath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const list = Object.values(states || {});
    writeAtomicWithBackup(p, JSON.stringify(list, null, 2));
  }
}

module.exports = { SyncStateStorage };
