const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

class MemoStorage {
  constructor(baseDir) {
    this.filePath = path.join(baseDir, "tools-memos.json");
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
    const data = this.load();
    return data.items.slice().sort((a, b) => {
      const pa = parseInt(a.priority[1], 10);
      const pb = parseInt(b.priority[1], 10);
      if (pa !== pb) return pa - pb;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  create({ title, content, priority }) {
    const data = this.load();
    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      title: title || "",
      content: content || "",
      priority: priority || "P3",
      createdAt: now,
      updatedAt: now
    };
    data.items.push(item);
    this.save(data);
    return item;
  }

  update({ id, title, content, priority }) {
    const data = this.load();
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`memo not found: ${id}`);
    if (title !== undefined) item.title = title;
    if (content !== undefined) item.content = content;
    if (priority !== undefined) item.priority = priority;
    item.updatedAt = new Date().toISOString();
    this.save(data);
    return item;
  }

  delete(id) {
    const data = this.load();
    data.items = data.items.filter((i) => i.id !== id);
    this.save(data);
  }
}

module.exports = { MemoStorage };
