const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { buildPathId } = require("./path-id.cjs");
const { writeAtomic, readJsonSafe } = require("../tools-utils/atomic-json.cjs");

class FileHashCache {
  constructor() {
    this.entries = new Map(); // key (lowercase rel) -> { length, lastWriteMs, hash }
    this.touched = new Set();
  }
}

function getCachePath(appDataDir, rootPath) {
  const folder = path.join(appDataDir, "HtyFrameworkSync", "Cache");
  const fileName = buildPathId(rootPath) + ".json";
  return path.join(folder, fileName);
}

function loadCache(appDataDir, rootPath) {
  const cache = new FileHashCache();
  try {
    const raw = readJsonSafe(getCachePath(appDataDir, rootPath));
    if (raw && typeof raw === "object") {
      for (const [key, val] of Object.entries(raw)) {
        cache.entries.set(key.toLowerCase(), val);
      }
    }
  } catch { /* ignore */ }
  return cache;
}

function saveCache(appDataDir, rootPath, cache) {
  try {
    const p = getCachePath(appDataDir, rootPath);
    fs.mkdirSync(path.dirname(p), { recursive: true });

    // prune untouched
    if (cache.touched.size > 0) {
      for (const key of [...cache.entries.keys()]) {
        if (!cache.touched.has(key)) cache.entries.delete(key);
      }
    }

    const obj = {};
    for (const [k, v] of cache.entries) obj[k] = v;
    // 缓存数据丢失可重建，不需要 .bak 备份
    writeAtomic(p, JSON.stringify(obj));
  } catch { /* ignore */ }
}

function normalizeRelative(rel) {
  return (rel || "").replace(/\//g, "\\").replace(/^\\+/, "").toLowerCase();
}

function getOrComputeHash(relativePath, fullPath, cache) {
  const key = normalizeRelative(relativePath);
  cache.touched.add(key);

  const stat = fs.statSync(fullPath);
  const existing = cache.entries.get(key);
  if (existing && existing.length === stat.size && existing.lastWriteMs === stat.mtimeMs && existing.hash) {
    return existing.hash;
  }

  const hash = computeFileHash(fullPath);
  cache.entries.set(key, { length: stat.size, lastWriteMs: stat.mtimeMs, hash });
  return hash;
}

function computeFileHash(filePath) {
  const sha = crypto.createHash("sha256");
  const buf = fs.readFileSync(filePath);
  sha.update(buf);
  return sha.digest("hex");
}

module.exports = { FileHashCache, loadCache, saveCache, getOrComputeHash, normalizeRelative };
