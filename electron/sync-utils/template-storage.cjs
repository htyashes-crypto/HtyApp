const fs = require("node:fs");
const path = require("node:path");

class TemplateStorage {
  constructor(appDataDir) {
    this.filePath = path.join(appDataDir, "HtyFrameworkSync", "blacklist_templates.json");
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return [];
      return JSON.parse(fs.readFileSync(this.filePath, "utf-8")) || [];
    } catch {
      return [];
    }
  }

  save(templates) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(templates || [], null, 2), "utf-8");
  }

  importFromFile(filePath) {
    const json = fs.readFileSync(filePath, "utf-8");
    const imported = JSON.parse(json);
    if (!Array.isArray(imported)) throw new Error("Invalid template file");
    return imported;
  }

  exportToFile(filePath, templates) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(templates || [], null, 2), "utf-8");
  }
}

module.exports = { TemplateStorage };
