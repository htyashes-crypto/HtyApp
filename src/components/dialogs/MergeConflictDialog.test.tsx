/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitMergeSessionResponse, MergeSessionFileDetail, MergeSessionSummary } from "../../lib/merge-types";

const { api } = vi.hoisted(() => ({
  api: {
    getMergeSessionFile: vi.fn(),
    resolveMergeSessionFile: vi.fn(),
    commitMergeSession: vi.fn()
  }
}));

vi.mock("../../lib/api", () => ({ api }));

import { MergeConflictDialog } from "./MergeConflictDialog";

const textSession: MergeSessionSummary = {
  sessionId: "session_text",
  operation: "update",
  action: "needs_resolution",
  state: "needs_resolution",
  title: "更新 review-skill",
  description: "检测到冲突，需要手动处理。",
  displayName: "review-skill",
  sourceLabel: "本地实例",
  targetLabel: "目标版本",
  cleanCount: 0,
  autoCount: 0,
  conflictCount: 1,
  resolvedCount: 0,
  totalCount: 1,
  files: [
    {
      relativePath: "SKILL.md",
      kind: "text",
      status: "conflict",
      resolution: null,
      summary: "文本冲突，需要手动处理。"
    }
  ]
};

const resolvedTextSession: MergeSessionSummary = {
  ...textSession,
  action: "ready",
  state: "ready",
  conflictCount: 0,
  resolvedCount: 1,
  files: [
    {
      relativePath: "SKILL.md",
      kind: "text",
      status: "resolved",
      resolution: "local",
      summary: "已选择保留本地版本。"
    }
  ]
};

const textConflictDetail: MergeSessionFileDetail = {
  sessionId: "session_text",
  operation: "update",
  title: "更新 review-skill",
  description: "检测到冲突，需要手动处理。",
  displayName: "review-skill",
  relativePath: "SKILL.md",
  kind: "text",
  status: "conflict",
  resolution: null,
  summary: "文本冲突，需要手动处理。",
  base: { exists: true, isBinary: false, text: "base content" },
  local: { exists: true, isBinary: false, text: "local content" },
  target: { exists: true, isBinary: false, text: "target content" },
  result: { exists: true, isBinary: false, text: "local draft" }
};

const resolvedTextDetail: MergeSessionFileDetail = {
  ...textConflictDetail,
  status: "resolved",
  resolution: "local",
  summary: "已选择保留本地版本。",
  result: { exists: true, isBinary: false, text: "local content" }
};

const binarySession: MergeSessionSummary = {
  sessionId: "session_binary",
  operation: "publish_append",
  action: "needs_resolution",
  state: "needs_resolution",
  title: "追加上传 review-skill",
  description: "检测到冲突，需要手动处理。",
  displayName: "review-skill",
  sourceLabel: "本地实例",
  targetLabel: "目标 Skill 最新版本",
  cleanCount: 0,
  autoCount: 0,
  conflictCount: 1,
  resolvedCount: 0,
  totalCount: 1,
  files: [
    {
      relativePath: "assets/icon.png",
      kind: "binary",
      status: "conflict",
      resolution: null,
      summary: "二进制或不可解码文件，需要手动选择。"
    }
  ]
};

const binaryDetail: MergeSessionFileDetail = {
  sessionId: "session_binary",
  operation: "publish_append",
  title: "追加上传 review-skill",
  description: "检测到冲突，需要手动处理。",
  displayName: "review-skill",
  relativePath: "assets/icon.png",
  kind: "binary",
  status: "conflict",
  resolution: null,
  summary: "二进制或不可解码文件，需要手动选择。",
  base: { exists: true, isBinary: true, text: null },
  local: { exists: true, isBinary: true, text: null },
  target: { exists: true, isBinary: true, text: null },
  result: { exists: true, isBinary: true, text: null }
};

const commitResponse: CommitMergeSessionResponse = {
  sessionId: "session_text",
  operation: "update",
  message: "已应用合并结果并更新本地实例。"
};

describe("MergeConflictDialog", () => {
  beforeEach(() => {
    api.commitMergeSession.mockResolvedValue(commitResponse);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps commit disabled while unresolved conflicts remain", async () => {
    api.getMergeSessionFile.mockResolvedValue(textConflictDetail);

    render(
      <MergeConflictDialog
        open
        session={textSession}
        onClose={vi.fn()}
        onCommitted={vi.fn()}
      />
    );

    await screen.findByLabelText("结果");
    expect(screen.getByRole("button", { name: "提交合并结果" })).toBeDisabled();
  });

  it("enables commit after resolving the last conflict and submits the merge result", async () => {
    api.getMergeSessionFile
      .mockResolvedValueOnce(textConflictDetail)
      .mockResolvedValueOnce(resolvedTextDetail);
    api.resolveMergeSessionFile.mockResolvedValue(resolvedTextSession);
    const onCommitted = vi.fn();
    const user = userEvent.setup();

    render(
      <MergeConflictDialog
        open
        session={textSession}
        onClose={vi.fn()}
        onCommitted={onCommitted}
      />
    );

    await screen.findByLabelText("结果");
    await user.click(screen.getByRole("button", { name: "保留本地" }));

    await waitFor(() => expect(api.resolveMergeSessionFile).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session_text",
      relativePath: "SKILL.md",
      resolution: "local"
    })));
    await waitFor(() => expect(screen.getByRole("button", { name: "提交合并结果" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "提交合并结果" }));

    await waitFor(() => expect(api.commitMergeSession).toHaveBeenCalledWith({ sessionId: "session_text" }));
    expect(onCommitted).toHaveBeenCalledWith(commitResponse);
  });

  it("shows file-level choices for binary conflicts without rendering the result editor", async () => {
    api.getMergeSessionFile.mockResolvedValue(binaryDetail);

    render(
      <MergeConflictDialog
        open
        session={binarySession}
        onClose={vi.fn()}
        onCommitted={vi.fn()}
      />
    );

    await screen.findByText("二进制冲突");
    expect(screen.queryByLabelText("结果")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保留本地" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "采用目标" })).toBeInTheDocument();
  });
});