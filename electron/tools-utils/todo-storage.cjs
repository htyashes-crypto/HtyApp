const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  writeAtomic,
  writeAtomicWithBackup,
  readJsonSafe,
  readJsonWithBackup
} = require("./atomic-json.cjs");

const NORMAL_SEQUENCE = ["not_started", "in_progress", "testing", "completed"];
const REWORK_SEQUENCE = ["rework", "in_progress", "testing", "completed"];

// 存储布局（v3）：
//   <baseDir>/tools-todo/
//     meta.json            — 分组与版本信息（带 .bak 备份）
//     items/<uuid>.json    — 每条任务单独一个文件
// 单条断电只损失一条，且分组结构永远独立保护。
class TodoStorage {
  constructor(baseDir) {
    this.legacyPath = path.join(baseDir, "tools-todo.json");
    this.dir = path.join(baseDir, "tools-todo");
    this.itemsDir = path.join(this.dir, "items");
    this.metaPath = path.join(this.dir, "meta.json");
    this._ensureInitialized();
  }

  _ensureInitialized() {
    fs.mkdirSync(this.itemsDir, { recursive: true });
    if (fs.existsSync(this.metaPath)) return;

    const legacy = readJsonSafe(this.legacyPath);

    // legacy v2: { version, groups, items }
    if (legacy && Array.isArray(legacy.groups) && Array.isArray(legacy.items)) {
      for (const item of legacy.items) {
        if (item && item.id) {
          writeAtomic(this._itemPath(item.id), JSON.stringify(item, null, 2));
        }
      }
      writeAtomicWithBackup(this.metaPath, JSON.stringify({
        version: 3,
        groups: legacy.groups
      }, null, 2));
      try { fs.renameSync(this.legacyPath, this.legacyPath + ".migrated"); } catch {}
      return;
    }

    // legacy v1: { items: [{ status: "done"|... }] } — 无 groups
    if (legacy && Array.isArray(legacy.items)) {
      const now = new Date().toISOString();
      const groups = [{ id: "default", name: "默认", createdAt: now }];
      for (const raw of legacy.items) {
        if (!raw || !raw.id) continue;
        const item = {
          ...raw,
          status: raw.status === "done" ? "completed" : "not_started",
          groupId: "default",
          hasReworked: false
        };
        writeAtomic(this._itemPath(item.id), JSON.stringify(item, null, 2));
      }
      writeAtomicWithBackup(this.metaPath, JSON.stringify({ version: 3, groups }, null, 2));
      try { fs.renameSync(this.legacyPath, this.legacyPath + ".migrated"); } catch {}
      return;
    }

    // 无可用旧数据 / 旧文件已损坏：用默认分组初始化
    writeAtomicWithBackup(this.metaPath, JSON.stringify({
      version: 3,
      groups: [{ id: "default", name: "默认", createdAt: new Date().toISOString() }]
    }, null, 2));
  }

  _itemPath(id) {
    return path.join(this.itemsDir, `${id}.json`);
  }

  _loadMeta() {
    const meta = readJsonWithBackup(this.metaPath);
    if (meta && Array.isArray(meta.groups)) return meta;
    return {
      version: 3,
      groups: [{ id: "default", name: "默认", createdAt: new Date().toISOString() }]
    };
  }

  _saveMeta(meta) {
    writeAtomicWithBackup(this.metaPath, JSON.stringify(meta, null, 2));
  }

  _loadItem(id) {
    return readJsonSafe(this._itemPath(id));
  }

  _saveItem(item) {
    writeAtomic(this._itemPath(item.id), JSON.stringify(item, null, 2));
  }

  _listAllItems() {
    if (!fs.existsSync(this.itemsDir)) return [];
    let files;
    try { files = fs.readdirSync(this.itemsDir); } catch { return []; }
    const items = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const id = f.slice(0, -5);
      const item = this._loadItem(id);
      if (item && item.id) items.push(item);
    }
    return items;
  }

  // ── Group methods ──

  listGroups() {
    return this._loadMeta().groups;
  }

  createGroup({ name }) {
    const meta = this._loadMeta();
    const group = {
      id: randomUUID(),
      name: name || "",
      createdAt: new Date().toISOString()
    };
    meta.groups.push(group);
    this._saveMeta(meta);
    return group;
  }

  renameGroup({ groupId, name }) {
    const meta = this._loadMeta();
    const group = meta.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`group not found: ${groupId}`);
    if (groupId === "default") throw new Error("cannot rename default group");
    group.name = name;
    this._saveMeta(meta);
    return group;
  }

  deleteGroup({ groupId }) {
    if (groupId === "default") throw new Error("cannot delete default group");
    const meta = this._loadMeta();
    meta.groups = meta.groups.filter((g) => g.id !== groupId);
    // 删该组下所有 task 文件（保持原有语义：连同任务一起删除）
    const items = this._listAllItems();
    for (const item of items) {
      if (item.groupId === groupId) {
        try { fs.unlinkSync(this._itemPath(item.id)); } catch {}
      }
    }
    this._saveMeta(meta);
  }

  // ── Task methods ──

  list({ groupId } = {}) {
    let items = this._listAllItems();
    if (groupId) items = items.filter((i) => i.groupId === groupId);
    // 保持原"最新创建在前"的顺序（旧实现用 unshift 实现）
    items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return items;
  }

  create({ title, description, priority, groupId }) {
    const item = {
      id: randomUUID(),
      title: title || "",
      description: description || "",
      status: "not_started",
      priority: priority || "normal",
      groupId: groupId || "default",
      hasReworked: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    this._saveItem(item);
    return item;
  }

  update({ id, title, description, priority }) {
    const item = this._loadItem(id);
    if (!item) throw new Error(`task not found: ${id}`);
    if (title !== undefined) item.title = title;
    if (description !== undefined) item.description = description;
    if (priority !== undefined) item.priority = priority;
    this._saveItem(item);
    return item;
  }

  advance({ id }) {
    const item = this._loadItem(id);
    if (!item) throw new Error(`task not found: ${id}`);
    const seq = item.status === "rework" ? REWORK_SEQUENCE : NORMAL_SEQUENCE;
    const idx = seq.indexOf(item.status);
    if (idx === -1 || idx >= seq.length - 1) throw new Error(`cannot advance from: ${item.status}`);
    item.status = seq[idx + 1];
    item.completedAt = item.status === "completed" ? new Date().toISOString() : null;
    this._saveItem(item);
    return item;
  }

  rollback({ id }) {
    const item = this._loadItem(id);
    if (!item) throw new Error(`task not found: ${id}`);
    const seq = item.hasReworked ? REWORK_SEQUENCE : NORMAL_SEQUENCE;
    const idx = seq.indexOf(item.status);
    if (idx <= 0) throw new Error(`cannot rollback from: ${item.status}`);
    item.status = seq[idx - 1];
    item.completedAt = null;
    this._saveItem(item);
    return item;
  }

  rework({ id }) {
    const item = this._loadItem(id);
    if (!item) throw new Error(`task not found: ${id}`);
    if (item.status !== "completed") throw new Error(`can only rework completed tasks`);
    item.status = "rework";
    item.hasReworked = true;
    item.completedAt = null;
    this._saveItem(item);
    return item;
  }

  delete(id) {
    const fp = this._itemPath(id);
    if (fs.existsSync(fp)) {
      try { fs.unlinkSync(fp); } catch {}
    }
  }

  clearCompleted() {
    const items = this._listAllItems();
    let removed = 0;
    for (const item of items) {
      if (item.status === "completed") {
        try { fs.unlinkSync(this._itemPath(item.id)); removed++; } catch {}
      }
    }
    return removed;
  }
}

module.exports = { TodoStorage };
