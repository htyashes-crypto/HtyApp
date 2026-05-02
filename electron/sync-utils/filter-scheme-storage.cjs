const fs = require("node:fs");
const path = require("node:path");
const { writeAtomicWithBackup, readJsonWithBackup } = require("../tools-utils/atomic-json.cjs");

class FilterSchemeStorage {
  constructor(appDataDir) {
    this.filePath = path.join(appDataDir, "HtyFrameworkSync", "filter_schemes.json");
  }

  load() {
    try {
      return readJsonWithBackup(this.filePath) || [];
    } catch {
      return [];
    }
  }

  save(schemes) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeAtomicWithBackup(this.filePath, JSON.stringify(schemes || [], null, 2));
  }
}

module.exports = { FilterSchemeStorage };
