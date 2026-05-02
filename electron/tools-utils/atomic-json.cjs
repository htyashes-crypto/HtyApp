const fs = require("node:fs");

// 原子写入：先写 .tmp → fsync → rename 替换。
// rename 在 NTFS / ext4 上是原子操作，断电要么看到旧文件，要么看到新文件，
// 不会出现"截断成 NUL"那种半成品状态。
function writeAtomic(filePath, content) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, content, "utf8");
  const fd = fs.openSync(tmp, "r+");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, filePath);
}

// 安全读取 JSON：返回 null 表示文件不可用（不存在 / 空 / 全 NUL / JSON 解析失败），
// 调用方应根据 null 自行决定是 fallback .bak 还是当作空。
// 不在这里抛错，避免把"文件损坏"传播成"应用崩溃"。
function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  if (buf.length === 0) return null;
  let allNul = true;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0) { allNul = false; break; }
  }
  if (allNul) return null;
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

// 主文件写完后立即把同样内容原子写一份到 .bak。
// - 主文件写中断电 → load 自动回退到 .bak（即上一次成功状态）
// - .bak 写中断电 → 主文件已是最新且完整，下次 load 直接走主文件
// 第一次写入也立刻建立 .bak，不存在"首次写入中断电就无救"的窗口。
function writeAtomicWithBackup(filePath, content) {
  writeAtomic(filePath, content);
  try { writeAtomic(filePath + ".bak", content); } catch {}
}

// 主文件损坏时尝试 .bak。回读成功会用 .bak 内容修复主文件。
function readJsonWithBackup(filePath) {
  const main = readJsonSafe(filePath);
  if (main !== null) return main;
  const bak = readJsonSafe(filePath + ".bak");
  if (bak !== null) {
    try { writeAtomic(filePath, JSON.stringify(bak, null, 2)); } catch {}
    return bak;
  }
  return null;
}

module.exports = { writeAtomic, writeAtomicWithBackup, readJsonSafe, readJsonWithBackup };
