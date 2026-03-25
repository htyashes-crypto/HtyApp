const fs = require("node:fs");
const path = require("node:path");
const { loadCache, saveCache, getOrComputeHash, normalizeRelative: normRelCache } = require("./file-hash-cache.cjs");
const { matchesMode, enumerateFilesRecursive, normalizeRel } = require("./file-sync.cjs");

const EXCLUDED_DIRS = new Set([".git", "bin", "obj", "library", "temp"]);

const TEXT_EXTS = new Set([
  ".cs", ".json", ".md", ".txt", ".xml", ".yaml", ".yml", ".cfg", ".ini", ".log",
  ".props", ".targets", ".csproj", ".meta"
]);

function toRelative(root, full) {
  const trimmed = root.replace(/[\\/]+$/, "");
  if (full.toLowerCase().startsWith(trimmed.toLowerCase())) {
    return full.substring(trimmed.length).replace(/^[\\/]+/, "");
  }
  return full;
}

function isExcluded(root, fullPath) {
  const rel = toRelative(root, fullPath);
  const parts = rel.split(/[\\/]/);
  return parts.some((p) => EXCLUDED_DIRS.has(p.toLowerCase()));
}

function isExcludedByBlacklist(root, fullPath, blacklistDirs) {
  if (!blacklistDirs || !blacklistDirs.length) return false;
  const rel = normalizeRel(toRelative(root, fullPath)).replace(/\//g, "\\");
  for (const raw of blacklistDirs) {
    if (!raw || !raw.trim()) continue;
    let item = raw.replace(/\//g, "\\").trim().replace(/^\\+/, "");
    const itemWithSep = item.endsWith("\\") ? item : item + "\\";
    if (rel.toLowerCase() === item.toLowerCase()) return true;
    if (rel.toLowerCase().startsWith(itemWithSep.toLowerCase())) return true;
  }
  return false;
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTS.has(ext);
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function countLines(text) {
  if (!text) return 0;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let count = normalized.split("\n").length;
  if (normalized.endsWith("\n")) count--;
  return Math.max(0, count);
}

function buildCodeChangeStats(projectFile, repoFile) {
  const projExists = projectFile && fs.existsSync(projectFile);
  const repoExists = repoFile && fs.existsSync(repoFile);
  const existingPath = projExists ? projectFile : repoExists ? repoFile : null;

  if (!existingPath || !isTextFile(existingPath)) {
    return { addedLines: 0, deletedLines: 0, modifiedLines: 0, summary: "-" };
  }

  if (projExists && !repoExists) {
    const text = readTextSafe(projectFile);
    const lines = countLines(text);
    return { addedLines: lines, deletedLines: 0, modifiedLines: 0, summary: `+${lines}` };
  }

  if (!projExists && repoExists) {
    const text = readTextSafe(repoFile);
    const lines = countLines(text);
    return { addedLines: 0, deletedLines: lines, modifiedLines: 0, summary: `-${lines}` };
  }

  // Both exist — simple line-based diff stats
  const leftLines = readTextSafe(repoFile).replace(/\r\n/g, "\n").split("\n");
  const rightLines = readTextSafe(projectFile).replace(/\r\n/g, "\n").split("\n");
  const leftSet = new Set(leftLines);
  const rightSet = new Set(rightLines);

  let added = 0;
  let deleted = 0;
  for (const line of rightLines) {
    if (!leftSet.has(line)) added++;
  }
  for (const line of leftLines) {
    if (!rightSet.has(line)) deleted++;
  }
  const modified = Math.min(added, deleted);
  added -= modified;
  deleted -= modified;

  const parts = [];
  if (added > 0) parts.push(`+${added}`);
  if (deleted > 0) parts.push(`-${deleted}`);
  if (modified > 0) parts.push(`~${modified}`);
  return { addedLines: added, deletedLines: deleted, modifiedLines: modified, summary: parts.join(" ") || "=" };
}

function filesEqualCached(relativePath, projectFile, repoFile, projectCache, repoCache) {
  try {
    const pStat = fs.statSync(projectFile);
    const rStat = fs.statSync(repoFile);
    if (pStat.size !== rStat.size) return false;
    const pHash = getOrComputeHash(relativePath, projectFile, projectCache);
    const rHash = getOrComputeHash(relativePath, repoFile, repoCache);
    return pHash === rHash;
  } catch {
    return false;
  }
}

function isConflict(relativePath, projectFile, repoFile, projExists, repoExists, projectCache, repoCache, baseStates) {
  const key = relativePath.toLowerCase();
  const baseState = baseStates[key];
  if (!baseState) return false;

  let projHash = "";
  let repoHash = "";

  if (projExists && projectFile && fs.existsSync(projectFile)) {
    projHash = getOrComputeHash(relativePath, projectFile, projectCache);
  }
  if (repoExists && repoFile && fs.existsSync(repoFile)) {
    repoHash = getOrComputeHash(relativePath, repoFile, repoCache);
  }

  if (projExists && repoExists) {
    if (projHash === repoHash) return false;
    if (!baseState.BaseExists) return true;
    const projChanged = projHash.toLowerCase() !== (baseState.BaseHash || "").toLowerCase();
    const repoChanged = repoHash.toLowerCase() !== (baseState.BaseHash || "").toLowerCase();
    return projChanged && repoChanged;
  }

  if (projExists && !repoExists) {
    if (!baseState.BaseExists) return false;
    return projHash.toLowerCase() !== (baseState.BaseHash || "").toLowerCase();
  }

  if (!projExists && repoExists) {
    if (!baseState.BaseExists) return false;
    return repoHash.toLowerCase() !== (baseState.BaseHash || "").toLowerCase();
  }

  return false;
}

function passesModeFilter(syncMode, relativePath) {
  if (syncMode === "All") return true;
  return matchesMode(relativePath, syncMode);
}

function passesPreCompareFilters(options, rel, sizeBytes, modifiedTime) {
  if (!passesModeFilter(options.syncMode || "All", rel)) return false;

  if (options.pathContains && rel.toLowerCase().indexOf(options.pathContains.toLowerCase()) < 0) return false;

  if (options.extensions && options.extensions.length > 0) {
    const name = path.basename(rel).toLowerCase();
    if (!options.extensions.some((ext) => name.endsWith(ext.toLowerCase()))) return false;
  }

  if (options.minSizeKB != null && sizeBytes < options.minSizeKB * 1024) return false;
  if (options.maxSizeKB != null && sizeBytes > options.maxSizeKB * 1024) return false;

  if (options.startDate || options.endDate) {
    if (!modifiedTime) return false;
    const t = new Date(modifiedTime);
    if (options.startDate && t < new Date(options.startDate)) return false;
    if (options.endDate && t > new Date(options.endDate + "T23:59:59")) return false;
  }

  return true;
}

function isStatusAllowed(status, options) {
  if (status === "modified") return options.includeModified !== false;
  if (status === "added") return options.includeAdded !== false;
  if (status === "deleted") return options.includeDeleted !== false;
  if (status === "conflict") return options.includeConflict !== false;
  return true;
}

function getStatusOrder(status) {
  switch (status) {
    case "conflict": return 0;
    case "modified": return 1;
    case "added": return 2;
    case "deleted": return 3;
    default: return 4;
  }
}

/**
 * Compute diffs between projectRoot and repoRoot
 * @param {string} appDataDir
 * @param {object} request - { projectRoot, repoRoot, syncMode, blacklistDirs }
 * @param {object} [filterOptions] - additional filter options
 * @param {function} [onProgress] - (done, total) => void
 * @returns {Array} diff entries
 */
function computeDiffs(appDataDir, request, filterOptions = {}, onProgress = null) {
  const { projectRoot, repoRoot, syncMode = "All", blacklistDirs = [] } = request;
  if (!projectRoot || !repoRoot) return [];

  const projectCache = loadCache(appDataDir, projectRoot);
  const repoCache = loadCache(appDataDir, repoRoot);

  // lazy-load SyncStateStorage
  const { SyncStateStorage } = require("./sync-state-storage.cjs");
  const stateStorage = new SyncStateStorage(appDataDir);
  const baseStates = stateStorage.load(projectRoot, repoRoot);

  const options = {
    syncMode,
    includeModified: true,
    includeAdded: true,
    includeDeleted: true,
    includeConflict: true,
    ...filterOptions
  };

  // Enumerate files
  const projectFilesRaw = enumerateFilesRecursive(projectRoot)
    .filter((p) => !isExcluded(projectRoot, p) && !isExcludedByBlacklist(projectRoot, p, blacklistDirs));
  const repoFilesRaw = enumerateFilesRecursive(repoRoot)
    .filter((p) => !isExcluded(repoRoot, p) && !isExcludedByBlacklist(repoRoot, p, blacklistDirs));

  const projectFiles = new Map();
  for (const f of projectFilesRaw) {
    const rel = normalizeRel(toRelative(projectRoot, f));
    projectFiles.set(rel.toLowerCase(), { rel, full: f });
  }

  const repoFiles = new Map();
  for (const f of repoFilesRaw) {
    const rel = normalizeRel(toRelative(repoRoot, f));
    repoFiles.set(rel.toLowerCase(), { rel, full: f });
  }

  // Touch cache
  for (const key of projectFiles.keys()) projectCache.touched.add(key);
  for (const key of repoFiles.keys()) repoCache.touched.add(key);

  const allKeys = new Set([...projectFiles.keys(), ...repoFiles.keys()]);
  const total = allKeys.size;
  let done = 0;
  if (onProgress) onProgress(0, total);

  const result = [];

  for (const key of [...allKeys].sort()) {
    const projEntry = projectFiles.get(key);
    const repoEntry = repoFiles.get(key);
    const inProj = Boolean(projEntry);
    const inRepo = Boolean(repoEntry);
    const rel = (projEntry || repoEntry).rel;

    if (inProj && !inRepo) {
      const stat = fs.statSync(projEntry.full);
      if (passesPreCompareFilters(options, rel, stat.size, stat.mtime) && isStatusAllowed("added", options)) {
        const stats = buildCodeChangeStats(projEntry.full, null);
        result.push({
          status: "added",
          relativePath: rel,
          sizeBytes: stat.size,
          modifiedTime: stat.mtime.toISOString(),
          modifiedTimeMs: stat.mtimeMs,
          extension: path.extname(rel),
          addedLines: stats.addedLines,
          deletedLines: stats.deletedLines,
          modifiedLines: stats.modifiedLines,
          codeChangeSummary: stats.summary
        });
      }
    } else if (!inProj && inRepo) {
      const stat = fs.statSync(repoEntry.full);
      if (passesPreCompareFilters(options, rel, stat.size, stat.mtime) && isStatusAllowed("deleted", options)) {
        const stats = buildCodeChangeStats(null, repoEntry.full);
        result.push({
          status: "deleted",
          relativePath: rel,
          sizeBytes: stat.size,
          modifiedTime: stat.mtime.toISOString(),
          modifiedTimeMs: stat.mtimeMs,
          extension: path.extname(rel),
          addedLines: stats.addedLines,
          deletedLines: stats.deletedLines,
          modifiedLines: stats.modifiedLines,
          codeChangeSummary: stats.summary
        });
      }
    } else if (inProj && inRepo) {
      const pStat = fs.statSync(projEntry.full);
      const rStat = fs.statSync(repoEntry.full);
      const lastTime = pStat.mtimeMs > rStat.mtimeMs ? pStat.mtime : rStat.mtime;
      const lastTimeMs = Math.max(pStat.mtimeMs, rStat.mtimeMs);

      if (passesPreCompareFilters(options, rel, pStat.size, lastTime) &&
          !filesEqualCached(rel, projEntry.full, repoEntry.full, projectCache, repoCache)) {
        const conflict = isConflict(rel, projEntry.full, repoEntry.full, true, true, projectCache, repoCache, baseStates);
        const status = conflict ? "conflict" : "modified";
        if (isStatusAllowed(status, options)) {
          const stats = buildCodeChangeStats(projEntry.full, repoEntry.full);
          result.push({
            status,
            relativePath: rel,
            sizeBytes: pStat.size,
            modifiedTime: lastTime.toISOString(),
            modifiedTimeMs: lastTimeMs,
            extension: path.extname(rel),
            addedLines: stats.addedLines,
            deletedLines: stats.deletedLines,
            modifiedLines: stats.modifiedLines,
            codeChangeSummary: stats.summary
          });
        }
      }
    }

    done++;
    if ((done & 15) === 0 && onProgress) onProgress(done, total);
  }

  // Save caches
  saveCache(appDataDir, projectRoot, projectCache);
  saveCache(appDataDir, repoRoot, repoCache);

  if (onProgress) onProgress(total, total);

  // Sort: conflicts first, then modified, added, deleted
  result.sort((a, b) => {
    const orderDiff = getStatusOrder(a.status) - getStatusOrder(b.status);
    if (orderDiff !== 0) return orderDiff;
    return a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: "base" });
  });

  return result;
}

module.exports = { computeDiffs, isExcluded, isExcludedByBlacklist, toRelative, readTextSafe };
