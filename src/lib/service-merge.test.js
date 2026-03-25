/* @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createDesktopService } = require("../../electron/service.cjs");

const tempRoots = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hty-merge-"));
  tempRoots.push(root);
  return root;
}

function skillDir(root, name) {
  return path.join(root, ".codex", "skills", name);
}

function writeSkill(root, name, content) {
  const dir = skillDir(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), content, "utf8");
  return dir;
}

function writeSkillFile(root, name, relativePath, content) {
  const filePath = path.join(skillDir(root, name), relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (Buffer.isBuffer(content)) {
    fs.writeFileSync(filePath, content);
  } else {
    fs.writeFileSync(filePath, content, "utf8");
  }
  return filePath;
}

function readSkill(root, name) {
  return fs.readFileSync(path.join(skillDir(root, name), "SKILL.md"), "utf8");
}

function readIndexFiles(root) {
  const indexDir = path.join(root, ".htyskillmanager", "instances");
  return fs.readdirSync(indexDir)
    .filter((entry) => entry.endsWith(".htyVersion"))
    .map((entry) => ({
      name: entry,
      path: path.join(indexDir, entry),
      json: JSON.parse(fs.readFileSync(path.join(indexDir, entry), "utf8"))
    }));
}

afterEach(() => {
  while (tempRoots.length) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

describe("desktop merge workflows", () => {
  it("returns no-op when linked and applied already point to the same version", () => {
    const baseDir = makeTempRoot();
    const workspace = makeTempRoot();
    writeSkill(workspace, "review-skill", "base line\nshared line\n");

    const service = createDesktopService({ defaultBaseDir: baseDir });
    const instance = service.scanWorkspace(workspace, "Workspace A").instances[0];
    const published = service.publishToGlobal({
      workspaceRoot: workspace,
      instanceId: instance.instanceId,
      skillMode: "create",
      name: "review-skill"
    });

    service.bindLocalInstance({
      workspaceRoot: workspace,
      instanceId: instance.instanceId,
      skillId: published.skillId,
      version: published.version
    });

    const preview = service.prepareUpdateMerge({
      workspaceRoot: workspace,
      instanceId: instance.instanceId
    });

    expect(preview).toEqual({
      action: "noop",
      operation: "update",
      message: "当前目标版本与已应用版本一致，没有可更新内容。"
    });
  });

  it("opens manual append merge when there is no reliable applied base", () => {
    const baseDir = makeTempRoot();
    const sourceWorkspace = makeTempRoot();
    const appendWorkspace = makeTempRoot();
    writeSkill(sourceWorkspace, "review-skill", "base line\nshared line\n");
    writeSkill(appendWorkspace, "review-skill", "other local line\nshared line\n");

    const service = createDesktopService({ defaultBaseDir: baseDir });
    const sourceInstance = service.scanWorkspace(sourceWorkspace, "Source").instances[0];
    const appendInstance = service.scanWorkspace(appendWorkspace, "Append").instances[0];
    const published = service.publishToGlobal({
      workspaceRoot: sourceWorkspace,
      instanceId: sourceInstance.instanceId,
      skillMode: "create",
      name: "review-skill"
    });

    const preview = service.prepareAppendPublishMerge({
      workspaceRoot: appendWorkspace,
      instanceId: appendInstance.instanceId,
      skillMode: "append",
      existingSkillId: published.skillId,
      notes: "append"
    });

    expect(preview.action).toBe("needs_resolution");
    expect(preview.conflictCount).toBeGreaterThan(0);
  });

  it("auto merges non-overlapping update changes and advances appliedVersion", () => {
    const baseDir = makeTempRoot();
    const sourceWorkspace = makeTempRoot();
    const targetWorkspace = makeTempRoot();
    writeSkill(sourceWorkspace, "review-skill", "intro\nshared\n");
    writeSkill(targetWorkspace, "review-skill", "intro\nshared\n");

    const service = createDesktopService({ defaultBaseDir: baseDir });
    const sourceInstance = service.scanWorkspace(sourceWorkspace, "Source").instances[0];
    const created = service.publishToGlobal({
      workspaceRoot: sourceWorkspace,
      instanceId: sourceInstance.instanceId,
      skillMode: "create",
      name: "review-skill"
    });

    writeSkill(sourceWorkspace, "review-skill", "intro\nshared target\n");
    const appendPreview = service.prepareAppendPublishMerge({
      workspaceRoot: sourceWorkspace,
      instanceId: sourceInstance.instanceId,
      skillMode: "append",
      existingSkillId: created.skillId,
      notes: "target changes"
    });
    expect(appendPreview.action).toBe("ready");
    const appended = service.commitMergeSession({ sessionId: appendPreview.sessionId });

    service.installFromGlobal({
      workspaceRoot: targetWorkspace,
      skillId: created.skillId,
      version: created.version,
      providers: ["codex"]
    });

    writeSkill(targetWorkspace, "review-skill", "intro local\nshared\n");
    const targetInstance = service.scanWorkspace(targetWorkspace, "Target").instances[0];
    service.bindLocalInstance({
      workspaceRoot: targetWorkspace,
      instanceId: targetInstance.instanceId,
      skillId: created.skillId,
      version: appended.version
    });

    const preview = service.prepareUpdateMerge({
      workspaceRoot: targetWorkspace,
      instanceId: targetInstance.instanceId
    });
    expect(preview.action).toBe("ready");

    service.commitMergeSession({ sessionId: preview.sessionId });

    expect(readSkill(targetWorkspace, "review-skill")).toBe("intro local\nshared target\n");
    const [index] = readIndexFiles(targetWorkspace);
    expect(index.json.appliedVersion).toBe(appended.version);
    expect(index.json.linkedVersion).toBe(appended.version);
  });

  it("opens manual update merge when both sides change the same text block", () => {
    const baseDir = makeTempRoot();
    const sourceWorkspace = makeTempRoot();
    const targetWorkspace = makeTempRoot();
    writeSkill(sourceWorkspace, "review-skill", "same line\nshared\n");
    writeSkill(targetWorkspace, "review-skill", "same line\nshared\n");

    const service = createDesktopService({ defaultBaseDir: baseDir });
    const sourceInstance = service.scanWorkspace(sourceWorkspace, "Source").instances[0];
    const created = service.publishToGlobal({
      workspaceRoot: sourceWorkspace,
      instanceId: sourceInstance.instanceId,
      skillMode: "create",
      name: "review-skill"
    });

    writeSkill(sourceWorkspace, "review-skill", "same line target\nshared\n");
    const appendPreview = service.prepareAppendPublishMerge({
      workspaceRoot: sourceWorkspace,
      instanceId: sourceInstance.instanceId,
      skillMode: "append",
      existingSkillId: created.skillId,
      notes: "target changes"
    });
    const appended = service.commitMergeSession({ sessionId: appendPreview.sessionId });

    service.installFromGlobal({
      workspaceRoot: targetWorkspace,
      skillId: created.skillId,
      version: created.version,
      providers: ["codex"]
    });

    writeSkill(targetWorkspace, "review-skill", "same line local\nshared\n");
    const targetInstance = service.scanWorkspace(targetWorkspace, "Target").instances[0];
    service.bindLocalInstance({
      workspaceRoot: targetWorkspace,
      instanceId: targetInstance.instanceId,
      skillId: created.skillId,
      version: appended.version
    });

    const preview = service.prepareUpdateMerge({
      workspaceRoot: targetWorkspace,
      instanceId: targetInstance.instanceId
    });
    expect(preview.action).toBe("needs_resolution");
    expect(preview.conflictCount).toBeGreaterThan(0);

    const detail = service.getMergeSessionFile(preview.sessionId, "SKILL.md");
    expect(detail.status).toBe("conflict");
    expect(detail.kind).toBe("text");
  });

  it("normalizes legacy index files without applied fields when rescanning", () => {
    const baseDir = makeTempRoot();
    const workspace = makeTempRoot();
    writeSkill(workspace, "review-skill", "base line\nshared line\n");

    const service = createDesktopService({ defaultBaseDir: baseDir });
    const instance = service.scanWorkspace(workspace, "Workspace A").instances[0];
    const published = service.publishToGlobal({
      workspaceRoot: workspace,
      instanceId: instance.instanceId,
      skillMode: "create",
      name: "review-skill"
    });

    const [indexFile] = readIndexFiles(workspace);
    delete indexFile.json.appliedSkillId;
    delete indexFile.json.appliedVersion;
    fs.writeFileSync(indexFile.path, JSON.stringify(indexFile.json, null, 2), "utf8");

    const rescanned = service.scanWorkspace(workspace, "Workspace A").instances[0];
    expect(rescanned.appliedSkillId).toBe(published.skillId);
    expect(rescanned.appliedVersion).toBe(published.version);

    const [normalizedIndexFile] = readIndexFiles(workspace);
    expect(normalizedIndexFile.json.appliedSkillId).toBe(published.skillId);
    expect(normalizedIndexFile.json.appliedVersion).toBe(published.version);
  });

  it("marks binary update conflicts for manual resolution", () => {
    const baseDir = makeTempRoot();
    const sourceWorkspace = makeTempRoot();
    const targetWorkspace = makeTempRoot();
    writeSkill(sourceWorkspace, "review-skill", "intro\nshared\n");
    writeSkill(targetWorkspace, "review-skill", "intro\nshared\n");
    writeSkillFile(sourceWorkspace, "review-skill", "assets/icon.bin", Buffer.from([255, 0, 1, 255]));
    writeSkillFile(targetWorkspace, "review-skill", "assets/icon.bin", Buffer.from([255, 0, 1, 255]));

    const service = createDesktopService({ defaultBaseDir: baseDir });
    const sourceInstance = service.scanWorkspace(sourceWorkspace, "Source").instances[0];
    const created = service.publishToGlobal({
      workspaceRoot: sourceWorkspace,
      instanceId: sourceInstance.instanceId,
      skillMode: "create",
      name: "review-skill"
    });

    writeSkillFile(sourceWorkspace, "review-skill", "assets/icon.bin", Buffer.from([255, 0, 2, 255]));
    const appendPreview = service.prepareAppendPublishMerge({
      workspaceRoot: sourceWorkspace,
      instanceId: sourceInstance.instanceId,
      skillMode: "append",
      existingSkillId: created.skillId,
      notes: "binary target changes"
    });
    expect(appendPreview.action).toBe("ready");
    const appended = service.commitMergeSession({ sessionId: appendPreview.sessionId });

    service.installFromGlobal({
      workspaceRoot: targetWorkspace,
      skillId: created.skillId,
      version: created.version,
      providers: ["codex"]
    });

    writeSkillFile(targetWorkspace, "review-skill", "assets/icon.bin", Buffer.from([255, 0, 3, 255]));
    const targetInstance = service.scanWorkspace(targetWorkspace, "Target").instances[0];
    service.bindLocalInstance({
      workspaceRoot: targetWorkspace,
      instanceId: targetInstance.instanceId,
      skillId: created.skillId,
      version: appended.version
    });

    const preview = service.prepareUpdateMerge({
      workspaceRoot: targetWorkspace,
      instanceId: targetInstance.instanceId
    });
    expect(preview.action).toBe("needs_resolution");

    const detail = service.getMergeSessionFile(preview.sessionId, "assets/icon.bin");
    expect(detail.status).toBe("conflict");
    expect(detail.kind).toBe("binary");
    expect(detail.local.isBinary).toBe(true);
    expect(detail.target.isBinary).toBe(true);
  });
});