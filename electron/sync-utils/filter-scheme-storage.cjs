const fs = require("node:fs");
const path = require("node:path");

class FilterSchemeStorage {
  constructor(appDataDir) {
    this.filePath = path.join(appDataDir, "HtyFrameworkSync", "filter_schemes.json");
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      return JSON.parse(fs.readFileSync(this.filePath, "utf-8")) || [];
    } catch {
      return [];
    }
  }

  save(schemes) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(schemes || [], null, 2), "utf-8");
  }
}

module.exports = { FilterSchemeStorage };
