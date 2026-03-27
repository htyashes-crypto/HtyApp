const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const NORMAL_SEQUENCE = ["not_started", "in_progress", "testing", "completed"];
const REWORK_SEQUENCE = ["rework", "in_progress", "testing", "completed"];

class TodoStorage {
  constructor(baseDir) {
    this.filePath = path.join(baseDir, "tools-todo.json");
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return {
        version: 2,
        groups: [{ id: "default", name: "默认", createdAt: new Date().toISOString() }],
        items: []
      };
    }
    const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (data.version === 1) {
      return this._migrate_v1_to_v2(data);
    }
    return data;
  }

  _migrate_v1_to_v2(data) {
    const now = new Date().toISOString();
    const migrated = {
      version: 2,
      groups: [{ id: "default", name: "默认", createdAt: now }],
      items: (data.items || []).map((item) => ({
        ...item,
        status: item.status === "done" ? "completed" : "not_started",
        groupId: "default",
        hasReworked: false
      }))
    };
    this.save(migrated);
    return migrated;
  }

  save(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  // ── Group methods ──

  listGroups() {
    return this.load().groups;
  }

  createGroup({ name }) {
    const data = this.load();
    const group = {
      id: randomUUID(),
      name: name || "",
      createdAt: new Date().toISOString()
    };
    data.groups.push(group);
    this.save(data);
    return group;
  }

  renameGroup({ groupId, name }) {
    const data = this.load();
    const group = data.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`group not found: ${groupId}`);
    if (groupId === "default") throw new Error("cannot rename default group");
    group.name = name;
    this.save(data);
    return group;
  }

  deleteGroup({ groupId }) {
    if (groupId === "default") throw new Error("cannot delete default group");
    const data = this.load();
    data.groups = data.groups.filter((g) => g.id !== groupId);
    data.items = data.items.filter((i) => i.groupId !== groupId);
    this.save(data);
  }

  // ── Task methods ──

  list({ groupId } = {}) {
    const items = this.load().items;
    if (groupId) return items.filter((i) => i.groupId === groupId);
    return items;
  }

  create({ title, description, priority, groupId }) {
    const data = this.load();
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
    data.items.unshift(item);
    this.save(data);
    return item;
  }

  update({ id, title, description, priority }) {
    const data = this.load();
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`task not found: ${id}`);
    if (title !== undefined) item.title = title;
    if (description !== undefined) item.description = description;
    if (priority !== undefined) item.priority = priority;
    this.save(data);
    return item;
  }

  advance({ id }) {
    const data = this.load();
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`task not found: ${id}`);
    const seq = item.status === "rework" ? REWORK_SEQUENCE : NORMAL_SEQUENCE;
    const idx = seq.indexOf(item.status);
    if (idx === -1 || idx >= seq.length - 1) throw new Error(`cannot advance from: ${item.status}`);
    item.status = seq[idx + 1];
    item.completedAt = item.status === "completed" ? new Date().toISOString() : null;
    this.save(data);
    return item;
  }

  rollback({ id }) {
    const data = this.load();
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`task not found: ${id}`);
    const seq = item.hasReworked ? REWORK_SEQUENCE : NORMAL_SEQUENCE;
    const idx = seq.indexOf(item.status);
    if (idx <= 0) throw new Error(`cannot rollback from: ${item.status}`);
    item.status = seq[idx - 1];
    item.completedAt = null;
    this.save(data);
    return item;
  }

  rework({ id }) {
    const data = this.load();
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`task not found: ${id}`);
    if (item.status !== "completed") throw new Error(`can only rework completed tasks`);
    item.status = "rework";
    item.hasReworked = true;
    item.completedAt = null;
    this.save(data);
    return item;
  }

  delete(id) {
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
}

module.exports = { TodoStorage };
