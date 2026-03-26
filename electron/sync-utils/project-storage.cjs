const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

class ProjectStorage {
  constructor(appDataDir) {
    this.dir = path.join(appDataDir, "HtyFrameworkSync");
    this.filePath = path.join(this.dir, "projects.json");
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return { Version: 2, Repositories: [] };
      const json = fs.readFileSync(this.filePath, "utf-8");
      const raw = JSON.parse(json);
      if (!raw) return { Version: 2, Repositories: [] };

      // Auto-migrate V1 format
      if (!raw.Version || raw.Version < 2) {
        const migrated = this._migrate(raw);
        this.save(migrated);
        return migrated;
      }

      return raw;
    } catch {
      return { Version: 2, Repositories: [] };
    }
  }

  save(data) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  _migrate(oldData) {
    const repoPath = oldData.RepositoryPath || "";
    const projects = oldData.Projects || [];
    const parts = repoPath.replace(/\\/g, "/").split("/");
    const name = parts[parts.length - 1] || "Default";

    return {
      Version: 2,
      Repositories: repoPath || projects.length
        ? [{
            Id: crypto.randomUUID(),
            Name: name,
            RepositoryPath: repoPath,
            Projects: projects
          }]
        : []
    };
  }
}

module.exports = { ProjectStorage };
