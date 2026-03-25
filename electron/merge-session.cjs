const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function prepareMergeSession({
  sessionsRoot,
  operation,
  title,
  description,
  displayName,
  sourceLabel,
  targetLabel,
  metadata,
  baseRoot,
  localRoot,
  targetRoot
}) {
  const sessionId = randomUUID();
  const sessionDir = path.join(sessionsRoot, sessionId);
  const paths = sessionPaths(sessionDir);

  ensureDir(sessionsRoot);
  ensureEmptyDir(sessionDir);
  copyTreeOrEnsureEmpty(baseRoot, paths.baseRoot);
  copyTreeOrEnsureEmpty(localRoot, paths.localRoot);
  copyTreeOrEnsureEmpty(targetRoot, paths.targetRoot);
  ensureEmptyDir(paths.resultRoot);

  const relativePaths = collectRelativePaths(paths.baseRoot, paths.localRoot, paths.targetRoot);
  const files = relativePaths.map((relativePath) => buildMergeFile(relativePath, paths));
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const meta = {
    schemaVersion: 1,
    sessionId,
    operation,
    title,
    description,
    displayName,
    sourceLabel,
    targetLabel,
    createdAt: nowIso(),
    state: files.some((entry) => entry.status === "conflict") ? "needs_resolution" : "ready",
    metadata,
    files
  };

  writeMeta(paths.metaPath, meta);
  return summarizeMeta(meta);
}

function getMergeSession(sessionsRoot, sessionId) {
  return summarizeMeta(readMergeSessionState(sessionsRoot, sessionId).meta);
}

function getMergeSessionFile(sessionsRoot, sessionId, relativePath) {
  const { meta, paths } = readMergeSessionState(sessionsRoot, sessionId);
  const file = meta.files.find((entry) => entry.relativePath === relativePath);
  if (!file) {
    throw new Error(`merge session file not found: ${relativePath}`);
  }

  return {
    sessionId,
    operation: meta.operation,
    title: meta.title,
    description: meta.description,
    displayName: meta.displayName,
    relativePath: file.relativePath,
    kind: file.kind,
    status: file.status,
    resolution: file.resolution,
    summary: file.summary,
    base: readFileView(paths.baseRoot, relativePath),
    local: readFileView(paths.localRoot, relativePath),
    target: readFileView(paths.targetRoot, relativePath),
    result: readFileView(paths.resultRoot, relativePath)
  };
}

function resolveMergeSessionFile(sessionsRoot, request) {
  const { sessionId, relativePath, resolution, content } = request;
  const state = readMergeSessionState(sessionsRoot, sessionId);
  const file = state.meta.files.find((entry) => entry.relativePath === relativePath);
  if (!file) {
    throw new Error(`merge session file not found: ${relativePath}`);
  }

  if (file.kind === "binary" && resolution === "manual") {
    throw new Error("二进制冲突不支持手工编辑。");
  }

  if (!["local", "target", "manual"].includes(resolution)) {
    throw new Error(`unsupported merge resolution: ${resolution}`);
  }

  if (resolution === "manual") {
    if (typeof content !== "string") {
      throw new Error("manual resolution requires text content");
    }
    writeTextToTree(state.paths.resultRoot, relativePath, content);
    file.status = "resolved";
    file.resolution = "manual";
    file.summary = "已手工编辑冲突结果。";
  } else {
    replaceResultFromSource(state.paths, relativePath, resolution);
    file.status = "resolved";
    file.resolution = resolution;
    file.summary = resolution === "local" ? "已选择保留本地版本。" : "已选择采用目标版本。";
  }

  state.meta.state = state.meta.files.some((entry) => entry.status === "conflict")
    ? "needs_resolution"
    : "ready";
  writeMeta(state.paths.metaPath, state.meta);
  return summarizeMeta(state.meta);
}

function discardMergeSession(sessionsRoot, sessionId) {
  const sessionDir = path.join(sessionsRoot, sessionId);
  fs.rmSync(sessionDir, { recursive: true, force: true });
  return { sessionId, message: "merge session discarded" };
}

function readMergeSessionState(sessionsRoot, sessionId) {
  const sessionDir = path.join(sessionsRoot, sessionId);
  const paths = sessionPaths(sessionDir);
  if (!fs.existsSync(paths.metaPath)) {
    throw new Error(`merge session not found: ${sessionId}`);
  }

  return {
    sessionDir,
    paths,
    meta: JSON.parse(fs.readFileSync(paths.metaPath, "utf8"))
  };
}

function sessionPaths(sessionDir) {
  return {
    sessionDir,
    metaPath: path.join(sessionDir, "meta.json"),
    baseRoot: path.join(sessionDir, "base"),
    localRoot: path.join(sessionDir, "local"),
    targetRoot: path.join(sessionDir, "target"),
    resultRoot: path.join(sessionDir, "result")
  };
}

function buildMergeFile(relativePath, paths) {
  const base = readSnapshotFile(paths.baseRoot, relativePath);
  const local = readSnapshotFile(paths.localRoot, relativePath);
  const target = readSnapshotFile(paths.targetRoot, relativePath);
  const kind = inferFileKind(base, local, target);

  if (!base.exists) {
    if (!local.exists && target.exists) {
      writeResultSnapshot(paths.resultRoot, relativePath, target);
      return createFileRecord(relativePath, kind, "clean", "target", "仅目标新增，直接采用目标内容。");
    }

    if (local.exists && !target.exists) {
      writeResultSnapshot(paths.resultRoot, relativePath, local);
      return createFileRecord(relativePath, kind, "clean", "local", "仅本地新增，保留本地内容。");
    }

    if (buffersEqual(local.buffer, target.buffer)) {
      writeResultSnapshot(paths.resultRoot, relativePath, local);
      return createFileRecord(relativePath, kind, "clean", "local", "双方新增内容一致。");
    }

    return createConflictRecord(relativePath, kind, paths, local, target, "新增文件内容不同，需要手动处理。");
  }

  if (!local.exists && !target.exists) {
    removeResultFile(paths.resultRoot, relativePath);
    return createFileRecord(relativePath, kind, "clean", "target", "双方都删除了该文件。");
  }

  if (!local.exists && target.exists) {
    if (buffersEqual(base.buffer, target.buffer)) {
      removeResultFile(paths.resultRoot, relativePath);
      return createFileRecord(relativePath, kind, "clean", "local", "本地删除该文件，目标未改动。");
    }

    return createConflictRecord(relativePath, kind, paths, local, target, "本地删除与目标修改冲突。");
  }

  if (local.exists && !target.exists) {
    if (buffersEqual(base.buffer, local.buffer)) {
      removeResultFile(paths.resultRoot, relativePath);
      return createFileRecord(relativePath, kind, "clean", "target", "目标删除该文件，本地未改动。");
    }

    return createConflictRecord(relativePath, kind, paths, local, target, "本地修改与目标删除冲突。");
  }

  if (buffersEqual(local.buffer, target.buffer)) {
    writeResultSnapshot(paths.resultRoot, relativePath, local);
    return createFileRecord(relativePath, kind, "clean", "local", "本地与目标内容一致。");
  }

  if (buffersEqual(base.buffer, local.buffer)) {
    writeResultSnapshot(paths.resultRoot, relativePath, target);
    return createFileRecord(relativePath, kind, "clean", "target", "本地未改动，直接采用目标内容。");
  }

  if (buffersEqual(base.buffer, target.buffer)) {
    writeResultSnapshot(paths.resultRoot, relativePath, local);
    return createFileRecord(relativePath, kind, "clean", "local", "目标未改动，保留本地内容。");
  }

  if (kind === "binary" || !base.isText || !local.isText || !target.isText) {
    return createConflictRecord(relativePath, "binary", paths, local, target, "二进制或不可解码文件，需要手动选择。");
  }

  const merged = tryThreeWayMerge(base.text, local.text, target.text);
  if (!merged.ok) {
    return createConflictRecord(relativePath, "text", paths, local, target, "文本同块修改冲突，需要手动处理。");
  }

  writeTextToTree(paths.resultRoot, relativePath, merged.text);
  return createFileRecord(relativePath, "text", "auto", "manual", "已自动合并非重叠文本修改。");
}

function createFileRecord(relativePath, kind, status, resolution, summary) {
  return {
    relativePath,
    kind,
    status,
    resolution,
    summary
  };
}

function createConflictRecord(relativePath, kind, paths, local, target, summary) {
  if (local.exists) {
    writeResultSnapshot(paths.resultRoot, relativePath, local);
  } else if (target.exists) {
    writeResultSnapshot(paths.resultRoot, relativePath, target);
  } else {
    removeResultFile(paths.resultRoot, relativePath);
  }

  return {
    relativePath,
    kind,
    status: "conflict",
    resolution: null,
    summary
  };
}

function summarizeMeta(meta) {
  let cleanCount = 0;
  let autoCount = 0;
  let conflictCount = 0;
  let resolvedCount = 0;

  for (const file of meta.files) {
    switch (file.status) {
      case "clean":
        cleanCount += 1;
        break;
      case "auto":
        autoCount += 1;
        break;
      case "conflict":
        conflictCount += 1;
        break;
      case "resolved":
        resolvedCount += 1;
        break;
      default:
        break;
    }
  }

  return {
    sessionId: meta.sessionId,
    operation: meta.operation,
    action: meta.state === "needs_resolution" ? "needs_resolution" : "ready",
    state: meta.state,
    title: meta.title,
    description: meta.description,
    displayName: meta.displayName,
    sourceLabel: meta.sourceLabel,
    targetLabel: meta.targetLabel,
    cleanCount,
    autoCount,
    conflictCount,
    resolvedCount,
    totalCount: meta.files.length,
    files: meta.files.map((file) => ({
      relativePath: file.relativePath,
      kind: file.kind,
      status: file.status,
      resolution: file.resolution,
      summary: file.summary
    }))
  };
}

function collectRelativePaths(...roots) {
  const paths = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    walkRelativeFiles(root, root, paths);
  }
  return [...paths];
}

function walkRelativeFiles(currentDir, rootDir, paths) {
  if (!fs.existsSync(currentDir)) {
    return;
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkRelativeFiles(absolutePath, rootDir, paths);
      continue;
    }

    paths.add(normalizePath(path.relative(rootDir, absolutePath)));
  }
}

function readSnapshotFile(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return { exists: false, buffer: null, isText: false, text: null };
  }

  const buffer = fs.readFileSync(absolutePath);
  const text = decodeUtf8(buffer);
  return {
    exists: true,
    buffer,
    isText: text !== null,
    text
  };
}

function readFileView(rootDir, relativePath) {
  const snapshot = readSnapshotFile(rootDir, relativePath);
  return {
    exists: snapshot.exists,
    isBinary: snapshot.exists ? !snapshot.isText : false,
    text: snapshot.exists && snapshot.isText ? snapshot.text : null
  };
}

function inferFileKind(base, local, target) {
  return [base, local, target].some((entry) => entry.exists && !entry.isText) ? "binary" : "text";
}

function decodeUtf8(buffer) {
  try {
    const text = buffer.toString("utf8");
    return Buffer.from(text, "utf8").equals(buffer) ? text : null;
  } catch {
    return null;
  }
}

function buffersEqual(left, right) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.equals(right);
}

function tryThreeWayMerge(baseText, localText, targetText) {
  if (localText === targetText) {
    return { ok: true, text: localText };
  }
  if (baseText === localText) {
    return { ok: true, text: targetText };
  }
  if (baseText === targetText) {
    return { ok: true, text: localText };
  }

  const baseLines = splitLines(baseText);
  const localLines = splitLines(localText);
  const targetLines = splitLines(targetText);
  const localChanges = diffLineRanges(baseLines, localLines);
  const targetChanges = diffLineRanges(baseLines, targetLines);

  return mergeDiffRanges(baseLines, localChanges, targetChanges);
}

function splitLines(text) {
  const matches = text.match(/.*?(?:\r\n|\n|$)/g) ?? [];
  if (matches.length && matches[matches.length - 1] === "") {
    matches.pop();
  }
  return matches;
}

function diffLineRanges(baseLines, nextLines) {
  const n = baseLines.length;
  const m = nextLines.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (baseLines[i] === nextLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const operations = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (baseLines[i] === nextLines[j]) {
      operations.push({ type: "equal", line: baseLines[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      operations.push({ type: "delete", line: baseLines[i] });
      i += 1;
    } else {
      operations.push({ type: "insert", line: nextLines[j] });
      j += 1;
    }
  }

  while (i < n) {
    operations.push({ type: "delete", line: baseLines[i] });
    i += 1;
  }

  while (j < m) {
    operations.push({ type: "insert", line: nextLines[j] });
    j += 1;
  }

  const ranges = [];
  let current = null;
  let baseIndex = 0;

  for (const operation of operations) {
    if (operation.type === "equal") {
      if (current) {
        ranges.push(current);
        current = null;
      }
      baseIndex += 1;
      continue;
    }

    if (!current) {
      current = {
        start: baseIndex,
        end: baseIndex,
        lines: []
      };
    }

    if (operation.type === "delete") {
      current.end += 1;
      baseIndex += 1;
      continue;
    }

    current.lines.push(operation.line);
  }

  if (current) {
    ranges.push(current);
  }

  return ranges;
}

function mergeDiffRanges(baseLines, localChanges, targetChanges) {
  const result = [];
  let baseIndex = 0;
  let localIndex = 0;
  let targetIndex = 0;

  while (baseIndex < baseLines.length || localIndex < localChanges.length || targetIndex < targetChanges.length) {
    const localChange = localChanges[localIndex] ?? null;
    const targetChange = targetChanges[targetIndex] ?? null;
    const nextStart = Math.min(
      localChange ? localChange.start : Number.POSITIVE_INFINITY,
      targetChange ? targetChange.start : Number.POSITIVE_INFINITY,
      baseLines.length
    );

    if (baseIndex < nextStart) {
      result.push(...baseLines.slice(baseIndex, nextStart));
      baseIndex = nextStart;
      continue;
    }

    if (!localChange && !targetChange) {
      if (baseIndex < baseLines.length) {
        result.push(...baseLines.slice(baseIndex));
      }
      break;
    }

    if (localChange && (!targetChange || localChange.end <= targetChange.start)) {
      result.push(...localChange.lines);
      baseIndex = localChange.end;
      localIndex += 1;
      continue;
    }

    if (targetChange && (!localChange || targetChange.end <= localChange.start)) {
      result.push(...targetChange.lines);
      baseIndex = targetChange.end;
      targetIndex += 1;
      continue;
    }

    if (localChange && targetChange) {
      if (
        localChange.start === targetChange.start &&
        localChange.end === targetChange.end &&
        arraysEqual(localChange.lines, targetChange.lines)
      ) {
        result.push(...localChange.lines);
        baseIndex = Math.max(localChange.end, targetChange.end);
        localIndex += 1;
        targetIndex += 1;
        continue;
      }

      return { ok: false };
    }
  }

  return {
    ok: true,
    text: result.join("")
  };
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function replaceResultFromSource(paths, relativePath, source) {
  const sourceRoot = source === "local" ? paths.localRoot : paths.targetRoot;
  const snapshot = readSnapshotFile(sourceRoot, relativePath);
  if (!snapshot.exists) {
    removeResultFile(paths.resultRoot, relativePath);
    return;
  }
  writeResultSnapshot(paths.resultRoot, relativePath, snapshot);
}

function writeResultSnapshot(resultRoot, relativePath, snapshot) {
  if (!snapshot.exists) {
    removeResultFile(resultRoot, relativePath);
    return;
  }

  const absolutePath = path.join(resultRoot, relativePath);
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, snapshot.buffer);
}

function writeTextToTree(rootDir, relativePath, text) {
  const absolutePath = path.join(rootDir, relativePath);
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, text, "utf8");
}

function removeResultFile(rootDir, relativePath) {
  fs.rmSync(path.join(rootDir, relativePath), { force: true });
}

function copyTreeOrEnsureEmpty(source, target) {
  if (!source) {
    ensureEmptyDir(target);
    return;
  }

  if (!fs.existsSync(source)) {
    ensureEmptyDir(target);
    return;
  }

  ensureEmptyDir(target);
  copyDirRecursive(source, target);
}

function copyDirRecursive(source, target) {
  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function ensureEmptyDir(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  ensureDir(directory);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function normalizePath(targetPath) {
  return targetPath.replaceAll("\\", "/");
}

function writeMeta(metaPath, meta) {
  ensureDir(path.dirname(metaPath));
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function treesEqual(leftRoot, rightRoot) {
  const leftPaths = collectRelativePaths(leftRoot);
  const rightPaths = collectRelativePaths(rightRoot);
  const union = new Set([...leftPaths, ...rightPaths]);

  for (const relativePath of union) {
    const left = readSnapshotFile(leftRoot, relativePath);
    const right = readSnapshotFile(rightRoot, relativePath);
    if (!buffersEqual(left.buffer, right.buffer)) {
      return false;
    }
  }

  return true;
}

module.exports = {
  discardMergeSession,
  getMergeSession,
  getMergeSessionFile,
  prepareMergeSession,
  readMergeSessionState,
  resolveMergeSessionFile,
  sessionPaths,
  treesEqual
};
