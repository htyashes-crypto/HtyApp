const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DEFAULT_GROUPS = [
  { id: "memo_group_p0", name: "P0", color: "#f87171" },
  { id: "memo_group_p1", name: "P1", color: "#fb923c" },
  { id: "memo_group_p2", name: "P2", color: "#fbbf24" },
  { id: "memo_group_p3", name: "P3", color: "#60a5fa" },
  { id: "memo_group_p4", name: "P4", color: "#34d399" },
  { id: "memo_group_p5", name: "P5", color: "#9fb0c2" }
];

const PRIORITY_TO_GROUP = {
  P0: "memo_group_p0",
  P1: "memo_group_p1",
  P2: "memo_group_p2",
  P3: "memo_group_p3",
  P4: "memo_group_p4",
  P5: "memo_group_p5"
};

class MemoStorage {
  constructor(baseDir) {
    this.filePath = path.join(baseDir, "tools-memos.json");
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      const now = new Date().toISOString();
      return {
        version: 2,
        groups: DEFAULT_GROUPS.map((g) => ({ ...g, createdAt: now })),
        items: []
      };
    }
    const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (data.version === 1) {
      return this.migrateV1ToV2(data);
    }
    return data;
  }

  migrateV1ToV2(v1Data) {
    const now = new Date().toISOString();
    const groups = DEFAULT_GROUPS.map((g) => ({ ...g, createdAt: now }));
    const items = (v1Data.items || []).map((item) => {
      const groupId = PRIORITY_TO_GROUP[item.priority] || "memo_group_p3";
      const { priority, ...rest } = item;
      return { ...rest, groupId };
    });
    const v2Data = { version: 2, groups, items };
    this.save(v2Data);
    return v2Data;
  }

  save(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  // ── Groups ──

  listGroups() {
    return this.load().groups;
  }

  createGroup({ name, color }) {
    const data = this.load();
    const now = new Date().toISOString();
    const group = { id: `memo_group_${randomUUID().slice(0, 8)}`, name, color, createdAt: now };
    data.groups.push(group);
    this.save(data);
    return group;
  }

  renameGroup({ groupId, name, color }) {
    const data = this.load();
    const group = data.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`group not found: ${groupId}`);
    if (name !== undefined) group.name = name;
    if (color !== undefined) group.color = color;
    this.save(data);
    return group;
  }

  deleteGroup({ groupId }) {
    const data = this.load();
    data.groups = data.groups.filter((g) => g.id !== groupId);
    // Move orphaned memos to first remaining group or remove groupId
    const fallbackId = data.groups.length > 0 ? data.groups[0].id : "";
    for (const item of data.items) {
      if (item.groupId === groupId) item.groupId = fallbackId;
    }
    this.save(data);
  }

  // ── Items ──

  list() {
    const data = this.load();
    const groupOrder = new Map(data.groups.map((g, i) => [g.id, i]));
    return data.items.slice().sort((a, b) => {
      const ga = groupOrder.get(a.groupId) ?? 999;
      const gb = groupOrder.get(b.groupId) ?? 999;
      if (ga !== gb) return ga - gb;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  create({ title, content, groupId }) {
    const data = this.load();
    const now = new Date().toISOString();
    const effectiveGroupId = groupId || (data.groups.length > 0 ? data.groups[0].id : "");
    const item = {
      id: randomUUID(),
      title: title || "",
      content: content || "",
      groupId: effectiveGroupId,
      createdAt: now,
      updatedAt: now
    };
    data.items.push(item);
    this.save(data);
    return item;
  }

  update({ id, title, content, groupId }) {
    const data = this.load();
    const item = data.items.find((i) => i.id === id);
    if (!item) throw new Error(`memo not found: ${id}`);
    if (title !== undefined) item.title = title;
    if (content !== undefined) item.content = content;
    if (groupId !== undefined) item.groupId = groupId;
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
