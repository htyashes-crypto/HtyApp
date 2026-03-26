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
      return { version: 2, workspaceId, workspaceRoot: "", groups: [] };
    }
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    // Migrate v1 (flat items) to v2 (groups)
    if (data.version === 1 && data.items) {
      data.version = 2;
      data.groups = data.items.map((item) => ({
        id: item.id,
        name: item.label,
        entries: [{
          id: randomUUID(),
          absolutePath: item.absolutePath,
          relativePath: item.relativePath,
          type: item.type
        }],
        createdAt: item.createdAt
      }));
      delete data.items;
      this.save(workspaceId, data);
    }
    return data;
  }

  save(workspaceId, data) {
    fs.writeFileSync(this._filePath(workspaceId), JSON.stringify(data, null, 2), "utf8");
  }

  listGroups(workspaceId) {
    return this.load(workspaceId).groups;
  }

  createGroup({ workspaceId, workspaceRoot, name }) {
    const data = this.load(workspaceId);
    data.workspaceRoot = workspaceRoot;
    const group = {
      id: randomUUID(),
      name: name || "新书签",
      entries: [],
      createdAt: new Date().toISOString()
    };
    data.groups.push(group);
    this.save(workspaceId, data);
    return group;
  }

  renameGroup({ workspaceId, groupId, name }) {
    const data = this.load(workspaceId);
    const group = data.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`group not found: ${groupId}`);
    group.name = name;
    this.save(workspaceId, data);
    return group;
  }

  deleteGroup({ workspaceId, groupId }) {
    const data = this.load(workspaceId);
    data.groups = data.groups.filter((g) => g.id !== groupId);
    this.save(workspaceId, data);
  }

  addEntry({ workspaceId, workspaceRoot, groupId, absolutePath }) {
    const data = this.load(workspaceId);
    data.workspaceRoot = workspaceRoot;
    const group = data.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`group not found: ${groupId}`);

    const resolved = path.resolve(absolutePath);
    const relative = path.relative(path.resolve(workspaceRoot), resolved).replace(/\\/g, "/");
    const isDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();

    const entry = {
      id: randomUUID(),
      absolutePath: resolved.replace(/\\/g, "/"),
      relativePath: relative,
      type: isDir ? "directory" : "file"
    };
    group.entries.push(entry);
    this.save(workspaceId, data);
    return entry;
  }

  deleteEntry({ workspaceId, groupId, entryId }) {
    const data = this.load(workspaceId);
    const group = data.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`group not found: ${groupId}`);
    group.entries = group.entries.filter((e) => e.id !== entryId);
    this.save(workspaceId, data);
  }
}

module.exports = { BookmarkStorage };
