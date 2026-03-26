const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

class TodoStorage {
  constructor(baseDir) {
    this.filePath = path.join(baseDir, "tools-todo.json");
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return { version: 1, items: [] };
    }
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  save(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  list() {
    return this.load().items;
  }

  create({ title, description, priority }) {
    const data = this.load();
    const item = {
      id: randomUUID(),
      title: title || "",
      description: description || "",
      status: "todo",
      priority: priority || "normal",
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    data.items.unshift(item);
    this.save(data);
    return item;
  }

  update({ id, title, description, status, priority }) {
    const data = this.load();
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`task not found: ${id}`);
    if (title !== undefined) item.title = title;
    if (description !== undefined) item.description = description;
    if (priority !== undefined) item.priority = priority;
    if (status !== undefined) {
      item.status = status;
      item.completedAt = status === "done" ? new Date().toISOString() : null;
    }
    this.save(data);
    return item;
  }

  delete(id) {
    const data = this.load();
    data.items = data.items.filter((i) => i.id !== id);
    this.save(data);
  }

  clearDone() {
    const data = this.load();
    const before = data.items.length;
    data.items = data.items.filter((i) => i.status !== "done");
    this.save(data);
    return before - data.items.length;
  }
}

module.exports = { TodoStorage };
