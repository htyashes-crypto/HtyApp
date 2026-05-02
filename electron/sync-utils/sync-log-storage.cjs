const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { writeAtomic, readJsonSafe } = require("../tools-utils/atomic-json.cjs");

class SyncLogStorage {
  constructor(appDataDir) {
    this.logPath = path.join(appDataDir, "HtyFrameworkSync", "sync_logs.jsonl");
    this.detailDir = path.join(appDataDir, "HtyFrameworkSync", "sync_log_details");
  }

  append(entry) {
    try {
      if (!entry.LogId) entry.LogId = "";
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      fs.appendFileSync(this.logPath, JSON.stringify(entry) + "\n", "utf-8");
    } catch { /* ignore */ }
  }

  appendWithDetails(entry, changes) {
    try {
      const validChanges = (changes || []).filter((c) => c && c.Path);
      if (validChanges.length > 0) {
        if (!entry.LogId) entry.LogId = crypto.randomUUID().replace(/-/g, "");
        const detailPath = path.join(this.detailDir, `${entry.LogId}.json`);
        fs.mkdirSync(path.dirname(detailPath), { recursive: true });
        writeAtomic(detailPath, JSON.stringify(validChanges, null, 2));
      }
      this.append(entry);
    } catch {
      this.append(entry);
    }
  }

  loadDetails(logId) {
    try {
      if (!logId) return [];
      return readJsonSafe(path.join(this.detailDir, `${logId}.json`)) || [];
    } catch {
      return [];
    }
  }

  loadForProject(projectPath, maxCount = 200) {
    const list = [];
    try {
      if (!fs.existsSync(this.logPath)) return list;
      const lines = fs.readFileSync(this.logPath, "utf-8").split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (!entry) continue;
          if (entry.ProjectPath && entry.ProjectPath.toLowerCase() === projectPath.toLowerCase()) {
            list.push(entry);
          }
        } catch { /* ignore bad line */ }
      }
    } catch {
      return list;
    }
    list.sort((a, b) => new Date(b.Time).getTime() - new Date(a.Time).getTime());
    return list.slice(0, maxCount);
  }
}

module.exports = { SyncLogStorage };
