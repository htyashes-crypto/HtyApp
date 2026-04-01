const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

class DownloadStorage {
  constructor(baseDir) {
    this.filePath = path.join(baseDir, "downloads.json");
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return {
        version: 1,
        items: [],
        settings: this._defaultSettings()
      };
    }
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  save(data) {
    const tmp = this.filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  _defaultSettings() {
    return {
      defaultSaveDir: path.join(os.homedir(), "Downloads"),
      maxConcurrentDownloads: 3,
      defaultSegmentCount: 4,
      speedLimitKBps: 0,
      autoStartDownloads: true
    };
  }

  listItems() {
    return this.load().items;
  }

  addItem(item) {
    const data = this.load();
    data.items.unshift(item);
    this.save(data);
    return item;
  }

  updateItem(id, updates) {
    const data = this.load();
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`download not found: ${id}`);
    Object.assign(item, updates);
    this.save(data);
    return item;
  }

  removeItem(id) {
    const data = this.load();
    data.items = data.items.filter((i) => i.id !== id);
    this.save(data);
  }

  clearCompleted() {
    const data = this.load();
    const before = data.items.length;
    data.items = data.items.filter((i) => i.status !== "completed");
    this.save(data);
    return before - data.items.length;
  }

  getSettings() {
    const data = this.load();
    return { ...this._defaultSettings(), ...data.settings };
  }

  saveSettings(settings) {
    const data = this.load();
    data.settings = { ...data.settings, ...settings };
    this.save(data);
    return data.settings;
  }
}

module.exports = { DownloadStorage };
