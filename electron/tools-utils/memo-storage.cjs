const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  writeAtomic,
  writeAtomicWithBackup,
  readJsonSafe,
  readJsonWithBackup
} = require("./atomic-json.cjs");

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

// 存储布局（v3）：
//   <baseDir>/tools-memos/
//     meta.json            — 分组与版本信息（带 .bak 备份）
//     items/<uuid>.json    — 每条备忘单独一个文件
// 单点失败只影响一条记录，不会再出现"全部丢失"。
class MemoStorage {
  constructor(baseDir) {
    this.legacyPath = path.join(baseDir, "tools-memos.json"); // v1/v2 单文件
    this.dir = path.join(baseDir, "tools-memos");
    this.itemsDir = path.join(this.dir, "items");
    this.metaPath = path.join(this.dir, "meta.json");
    this._ensureInitialized();
  }

  _ensureInitialized() {
    fs.mkdirSync(this.itemsDir, { recursive: true });
    if (fs.existsSync(this.metaPath)) return;

    // 第一次启动新格式：尝试从旧的单文件迁移
    const legacy = readJsonSafe(this.legacyPath);
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

    // legacy 是 v1（无 groups），按优先级映射后迁移
    if (legacy && Array.isArray(legacy.items) && legacy.version === 1) {
      const now = new Date().toISOString();
      const groups = DEFAULT_GROUPS.map((g) => ({ ...g, createdAt: now }));
      for (const raw of legacy.items) {
        if (!raw || !raw.id) continue;
        const groupId = PRIORITY_TO_GROUP[raw.priority] || "memo_group_p3";
        const { priority, ...rest } = raw;
        const item = { ...rest, groupId };
        writeAtomic(this._itemPath(item.id), JSON.stringify(item, null, 2));
      }
      writeAtomicWithBackup(this.metaPath, JSON.stringify({ version: 3, groups }, null, 2));
      try { fs.renameSync(this.legacyPath, this.legacyPath + ".migrated"); } catch {}
      return;
    }

    // 没有可用旧数据（包括旧文件已损坏的情况）→ 用默认分组初始化
    const now = new Date().toISOString();
    writeAtomicWithBackup(this.metaPath, JSON.stringify({
      version: 3,
      groups: DEFAULT_GROUPS.map((g) => ({ ...g, createdAt: now }))
    }, null, 2));
  }

  _itemPath(id) {
    return path.join(this.itemsDir, `${id}.json`);
  }

  _loadMeta() {
    const meta = readJsonWithBackup(this.metaPath);
    if (meta && Array.isArray(meta.groups)) return meta;
    // 极端情况：主文件 + .bak 都没了。返回内存默认值，但**不立即回写**，
    // 避免在没有任何用户改动的 list() 之后就把 .bak 也覆盖掉。
    const now = new Date().toISOString();
    return {
      version: 3,
      groups: DEFAULT_GROUPS.map((g) => ({ ...g, createdAt: now }))
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
    try {
      files = fs.readdirSync(this.itemsDir);
    } catch {
      return [];
    }
    const items = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue; // 跳过 .tmp 等
      const id = f.slice(0, -5);
      const item = this._loadItem(id);
      if (item && item.id) items.push(item);
      // 单条损坏不影响其他条目，静默跳过
    }
    return items;
  }

  // ── Groups ──

  listGroups() {
    return this._loadMeta().groups;
  }

  createGroup({ name, color }) {
    const meta = this._loadMeta();
    const now = new Date().toISOString();
    const group = { id: `memo_group_${randomUUID().slice(0, 8)}`, name, color, createdAt: now };
    meta.groups.push(group);
    this._saveMeta(meta);
    return group;
  }

  renameGroup({ groupId, name, color }) {
    const meta = this._loadMeta();
    const group = meta.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`group not found: ${groupId}`);
    if (name !== undefined) group.name = name;
    if (color !== undefined) group.color = color;
    this._saveMeta(meta);
    return group;
  }

  deleteGroup({ groupId }) {
    const meta = this._loadMeta();
    meta.groups = meta.groups.filter((g) => g.id !== groupId);
    const fallbackId = meta.groups.length > 0 ? meta.groups[0].id : "";
    const items = this._listAllItems();
    for (const item of items) {
      if (item.groupId === groupId) {
        item.groupId = fallbackId;
        this._saveItem(item);
      }
    }
    this._saveMeta(meta);
  }

  // ── Items ──

  list() {
    const meta = this._loadMeta();
    const items = this._listAllItems();
    const groupOrder = new Map(meta.groups.map((g, i) => [g.id, i]));
    return items.sort((a, b) => {
      const ga = groupOrder.get(a.groupId) ?? 999;
      const gb = groupOrder.get(b.groupId) ?? 999;
      if (ga !== gb) return ga - gb;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
  }

  create({ title, content, groupId }) {
    const meta = this._loadMeta();
    const now = new Date().toISOString();
    const effectiveGroupId = groupId || (meta.groups.length > 0 ? meta.groups[0].id : "");
    const item = {
      id: randomUUID(),
      title: title || "",
      content: content || "",
      groupId: effectiveGroupId,
      createdAt: now,
      updatedAt: now
    };
    this._saveItem(item);
    return item;
  }

  update({ id, title, content, groupId }) {
    const item = this._loadItem(id);
    if (!item) throw new Error(`memo not found: ${id}`);
    if (title !== undefined) item.title = title;
    if (content !== undefined) item.content = content;
    if (groupId !== undefined) item.groupId = groupId;
    item.updatedAt = new Date().toISOString();
    this._saveItem(item);
    return item;
  }

  delete(id) {
    const fp = this._itemPath(id);
    if (fs.existsSync(fp)) {
      try { fs.unlinkSync(fp); } catch {}
    }
  }
}

module.exports = { MemoStorage };
