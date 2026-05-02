const fs = require("node:fs");
const path = require("node:path");
const { writeAtomic, writeAtomicWithBackup, readJsonWithBackup } = require("../tools-utils/atomic-json.cjs");

class TemplateStorage {
  constructor(appDataDir) {
    this.filePath = path.join(appDataDir, "HtyFrameworkSync", "blacklist_templates.json");
  }

  load() {
    try {
      return readJsonWithBackup(this.filePath) || [];
    } catch {
      return [];
    }
  }

  save(templates) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeAtomicWithBackup(this.filePath, JSON.stringify(templates || [], null, 2));
  }

  importFromFile(filePath) {
    const json = fs.readFileSync(filePath, "utf-8");
    const imported = JSON.parse(json);
    if (!Array.isArray(imported)) throw new Error("Invalid template file");
    return imported;
  }

  exportToFile(filePath, templates) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // 用户主动导出的文件，不需要 .bak（在用户选定的目标位置生成）
    writeAtomic(filePath, JSON.stringify(templates || [], null, 2));
  }
}

module.exports = { TemplateStorage };
