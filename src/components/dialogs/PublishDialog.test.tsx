/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MergeSessionSummary } from "../../lib/merge-types";
import type { GlobalSkillSummary, LocalInstance } from "../../lib/types";

const { api } = vi.hoisted(() => ({
  api: {
    prepareAppendPublishMerge: vi.fn(),
    commitMergeSession: vi.fn(),
    publishToGlobal: vi.fn()
  }
}));

vi.mock("../../lib/api", () => ({ api }));

import { PublishDialog } from "./PublishDialog";

const instance: LocalInstance = {
  instanceId: "instance_1",
  workspaceId: "workspace_1",
  provider: "codex",
  relativePath: ".codex/skills/review-skill",
  displayName: "review-skill",
  linkedSkillId: "skill_001",
  linkedVersion: "1.0.8",
  appliedSkillId: "skill_001",
  appliedVersion: "1.0.7",
  status: "bound",
  indexPath: ".htyskillmanager/instances/instance_1.htyVersion"
};

const library: GlobalSkillSummary[] = [
  {
    skillId: "skill_001",
    slug: "review-skill",
    name: "review-skill",
    description: "review workflow",
    tags: ["review"],
    latestVersion: "1.0.9",
    latestProviders: ["codex", "claude", "cursor"],
    versionCount: 2,
    createdAt: "2026-03-20T00:00:00Z"
  }
];

function createPreview(action: "ready" | "needs_resolution"): MergeSessionSummary {
  return {
    sessionId: action === "ready" ? "session_ready" : "session_conflict",
    operation: "publish_append",
    action,
    state: action,
    title: "追加上传 review-skill",
    description: action === "ready" ? "已完成自动分析，可以直接提交。" : "检测到冲突，需要手动处理。",
    displayName: "review-skill",
    sourceLabel: "本地实例",
    targetLabel: "目标 Skill 最新版本",
    cleanCount: 0,
    autoCount: 1,
    conflictCount: action === "ready" ? 0 : 1,
    resolvedCount: 0,
    totalCount: action === "ready" ? 1 : 2,
    files: action === "ready"
      ? [
          {
            relativePath: "SKILL.md",
            kind: "text",
            status: "auto",
            resolution: "manual",
            summary: "已自动合并非重叠文本修改。"
          }
        ]
      : [
          {
            relativePath: "SKILL.md",
            kind: "text",
            status: "conflict",
            resolution: null,
            summary: "文本冲突，需要手动处理。"
          },
          {
            relativePath: "references/guide.md",
            kind: "text",
            status: "auto",
            resolution: "manual",
            summary: "已自动合并非重叠文本修改。"
          }
        ]
  };
}

describe("PublishDialog", () => {
  beforeEach(() => {
    api.publishToGlobal.mockResolvedValue({
      skillId: "skill_010",
      version: "1.0.0",
      providers: ["codex", "claude", "cursor"]
    });
    api.commitMergeSession.mockResolvedValue({
      sessionId: "session_ready",
      operation: "publish_append",
      message: "已发布合并结果并同步本地实例。",
      skillId: "skill_001",
      version: "1.0.9",
      providers: ["codex", "claude", "cursor"]
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the merge session instead of publishing directly when append preview needs resolution", async () => {
    api.prepareAppendPublishMerge.mockResolvedValue(createPreview("needs_resolution"));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const onOpenMergeSession = vi.fn();
    const user = userEvent.setup();

    render(
      <PublishDialog
        open
        instance={instance}
        workspaceRoot="E:/Projects/Workspace"
        library={library}
        onClose={onClose}
        onSuccess={onSuccess}
        onOpenMergeSession={onOpenMergeSession}
      />
    );

    await screen.findByRole("button", { name: "分析并上传" });
    await user.click(screen.getByRole("button", { name: "分析并上传" }));

    await waitFor(() => expect(api.prepareAppendPublishMerge).toHaveBeenCalledTimes(1));
    expect(api.prepareAppendPublishMerge).toHaveBeenCalledWith({
      workspaceRoot: "E:/Projects/Workspace",
      instanceId: "instance_1",
      providers: ["codex", "claude", "cursor"],
      skillMode: "append",
      existingSkillId: "skill_001",
      notes: ""
    });
    expect(onOpenMergeSession).toHaveBeenCalledWith(createPreview("needs_resolution"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(api.commitMergeSession).not.toHaveBeenCalled();
  });

  it("commits immediately after preview when append merge is ready", async () => {
    api.prepareAppendPublishMerge.mockResolvedValue(createPreview("ready"));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const onOpenMergeSession = vi.fn();
    const user = userEvent.setup();

    render(
      <PublishDialog
        open
        instance={instance}
        workspaceRoot="E:/Projects/Workspace"
        library={library}
        onClose={onClose}
        onSuccess={onSuccess}
        onOpenMergeSession={onOpenMergeSession}
      />
    );

    await screen.findByRole("button", { name: "分析并上传" });
    await user.click(screen.getByRole("button", { name: "分析并上传" }));

    await waitFor(() => expect(api.commitMergeSession).toHaveBeenCalledWith({ sessionId: "session_ready" }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenMergeSession).not.toHaveBeenCalled();
  });
});