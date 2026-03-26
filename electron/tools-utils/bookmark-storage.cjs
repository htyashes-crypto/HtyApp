const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

class BookmarkStorage {
  constructor(baseDir) {
    this.dir = path.join(baseDir, "tools-bookmarks");
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  _filePath(workspaceId) {
    return path.join(this.dir, `${workspaceId}.json`);
  }

  load(workspaceId) {
    const fp = this._filePath(workspaceId);
    if (!fs.existsSync(fp)) {
      return { version: 1, workspaceId, workspaceRoot: "", items: [] };
    }
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  }

  save(workspaceId, data) {
    fs.writeFileSync(this._filePath(workspaceId), JSON.stringify(data, null, 2), "utf8");
  }

  list(workspaceId) {
    return this.load(workspaceId).items;
  }

  add({ workspaceId, workspaceRoot, absolutePath }) {
    const data = this.load(workspaceId);
    data.workspaceRoot = workspaceRoot;

    const resolved = path.resolve(absolutePath);
    const relative = path.relative(path.resolve(workspaceRoot), resolved).replace(/\\/g, "/");
    const isDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();

    const item = {
      id: randomUUID(),
      label: path.basename(resolved),
      absolutePath: resolved.replace(/\\/g, "/"),
      relativePath: relative,
      type: isDir ? "directory" : "file",
      createdAt: new Date().toISOString()
    };
    data.items.push(item);
    this.save(workspaceId, data);
    return item;
  }

  update({ workspaceId, id, label }) {
    const data = this.load(workspaceId);
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`bookmark not found: ${id}`);
    if (label !== undefined) item.label = label;
    this.save(workspaceId, data);
    return item;
  }

  delete(workspaceId, id) {
    const data = this.load(workspaceId);
    data.items = data.items.filter((i) => i.id !== id);
    this.save(workspaceId, data);
  }
}

module.exports = { BookmarkStorage };
