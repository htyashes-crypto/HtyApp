const fs = require("node:fs");
const path = require("node:path");

class ProjectStorage {
  constructor(appDataDir) {
    this.dir = path.join(appDataDir, "HtyFrameworkSync");
    this.filePath = path.join(this.dir, "projects.json");
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return { RepositoryPath: "", Projects: [] };
      const json = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(json) || { RepositoryPath: "", Projects: [] };
    } catch {
      return { RepositoryPath: "", Projects: [] };
    }
  }

  save(data) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}

module.exports = { ProjectStorage };
