const fs = require("node:fs");
const path = require("node:path");

const SYNC_MODE = { All: "All", Script: "Script", Meta: "Meta", ScriptMeta: "ScriptMeta", Other: "Other" };

function matchesMode(filePath, mode) {
  if (mode === SYNC_MODE.All) return true;
  return classify(filePath) === mode;
}

function classify(filePath) {
  if (!filePath) return SYNC_MODE.Other;
  if (filePath.toLowerCase().endsWith(".cs.meta")) return SYNC_MODE.ScriptMeta;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".cs") return SYNC_MODE.Script;
  if (ext === ".meta") return SYNC_MODE.Meta;
  return SYNC_MODE.Other;
}

function normalizeRel(rel) {
  return (rel || "").replace(/\//g, "\\");
}

function normalizeBlacklist(relDirs) {
  const list = [];
  if (!relDirs) return list;
  for (const raw of relDirs) {
    if (!raw || !raw.trim()) continue;
    let rel = normalizeRel(raw).replace(/^\\+/, "").replace(/\\+$/, "");
    if (!rel) continue;
    rel += "\\";
    if (!list.some((x) => x.toLowerCase() === rel.toLowerCase())) list.push(rel);
  }
  return list;
}

function isBlacklisted(relativeFilePath, normalizedPrefixes) {
  if (!normalizedPrefixes.length) return false;
  const rel = normalizeRel(relativeFilePath).replace(/^\\+/, "");
  for (const prefix of normalizedPrefixes) {
    if (rel.toLowerCase().startsWith(prefix.toLowerCase())) return true;
  }
  return false;
}

function needCopy(src, dst, verifyContent) {
  const sInfo = fs.statSync(src);
  const dInfo = fs.statSync(dst);
  if (sInfo.size !== dInfo.size) return true;
  const dtDiff = Math.abs(sInfo.mtimeMs - dInfo.mtimeMs);
  if (dtDiff > 2000) {
    if (!verifyContent) return true;
  } else {
    if (!verifyContent) return false;
  }
  return !filesEqual(src, dst);
}

function filesEqual(path1, path2) {
  try {
    const s1 = fs.statSync(path1);
    const s2 = fs.statSync(path2);
    if (s1.size !== s2.size) return false;
    const BUFFER = 128 * 1024;
    const fd1 = fs.openSync(path1, "r");
    const fd2 = fs.openSync(path2, "r");
    try {
      const b1 = Buffer.alloc(BUFFER);
      const b2 = Buffer.alloc(BUFFER);
      let pos = 0;
      while (pos < s1.size) {
        const r1 = fs.readSync(fd1, b1, 0, BUFFER, pos);
        const r2 = fs.readSync(fd2, b2, 0, BUFFER, pos);
        if (r1 !== r2) return false;
        if (r1 === 0) return true;
        if (Buffer.compare(b1.subarray(0, r1), b2.subarray(0, r2)) !== 0) return false;
        pos += r1;
      }
      return true;
    } finally {
      fs.closeSync(fd1);
      fs.closeSync(fd2);
    }
  } catch {
    return false;
  }
}

function copyFileOverwrite(src, dst) {
  try {
    if (fs.existsSync(dst)) {
      fs.chmodSync(dst, 0o666);
    }
  } catch { /* ignore */ }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  try {
    const srcStat = fs.statSync(src);
    fs.utimesSync(dst, srcStat.atime, srcStat.mtime);
  } catch { /* ignore */ }
}

function deleteFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    fs.chmodSync(filePath, 0o666);
    fs.unlinkSync(filePath);
  } catch { /* ignore */ }
}

const SKIP_DIRS = new Set([".git", "node_modules", ".vs", "release"]);

function enumerateFilesRecursive(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const nameLower = entry.name.toLowerCase();
      if (entry.isDirectory() && SKIP_DIRS.has(nameLower)) continue;
      if (nameLower.endsWith(".asar")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }
  return results;
}

function cleanupEmptyDirs(root, normalizedPrefixes) {
  try {
    const dirs = [];
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      let entries;
      try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const full = path.join(current, entry.name);
          dirs.push(full);
          stack.push(full);
        }
      }
    }
    // sort by length descending (deepest first)
    dirs.sort((a, b) => b.length - a.length);
    for (const dir of dirs) {
      try {
        const rel = normalizeRel(path.relative(root, dir)).replace(/^\\+/, "") + "\\";
        if (normalizedPrefixes.some((p) => rel.toLowerCase().startsWith(p.toLowerCase()))) continue;
        const entries = fs.readdirSync(dir);
        if (entries.length === 0) fs.rmdirSync(dir);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function syncFolder(sourceDir, targetDir, mode = "All", verifyContent = false, blacklist = [], changes = null) {
  if (!sourceDir || !fs.existsSync(sourceDir)) throw new Error(`Source directory not found: ${sourceDir}`);
  if (!targetDir) throw new Error("Target directory is invalid");
  fs.mkdirSync(targetDir, { recursive: true });

  const summary = { copied: 0, overwritten: 0, deleted: 0 };
  const sourceSet = new Set();
  const blist = normalizeBlacklist(blacklist);

  // 1) Copy source to target
  for (const file of enumerateFilesRecursive(sourceDir)) {
    const rel = normalizeRel(path.relative(sourceDir, file));
    if (isBlacklisted(rel, blist)) continue;
    if (!matchesMode(file, mode)) continue;
    sourceSet.add(rel.toLowerCase());
    const dest = path.join(targetDir, rel);
    if (!fs.existsSync(dest)) {
      copyFileOverwrite(file, dest);
      summary.copied++;
      if (changes) changes.push({ path: rel, action: "Copied" });
    } else if (needCopy(file, dest, verifyContent)) {
      copyFileOverwrite(file, dest);
      summary.overwritten++;
      if (changes) changes.push({ path: rel, action: "Overwritten" });
    }
  }

  // 2) Delete extra files in target
  for (const targetFile of enumerateFilesRecursive(targetDir)) {
    const rel = normalizeRel(path.relative(targetDir, targetFile));
    if (isBlacklisted(rel, blist)) continue;
    if (!matchesMode(targetFile, mode)) continue;
    if (!sourceSet.has(rel.toLowerCase())) {
      deleteFileSafe(targetFile);
      summary.deleted++;
      if (changes) changes.push({ path: rel, action: "Deleted" });
    }
  }

  // 3) Cleanup empty dirs
  cleanupEmptyDirs(targetDir, blist);

  return summary;
}

module.exports = {
  SYNC_MODE,
  matchesMode,
  classify,
  syncFolder,
  needCopy,
  filesEqual,
  enumerateFilesRecursive,
  normalizeRel,
  normalizeBlacklist,
  isBlacklisted,
  copyFileOverwrite,
  deleteFileSafe
};
