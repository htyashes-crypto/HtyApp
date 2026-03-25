import type { Provider } from "./types";

export type MergeOperation = "publish_append" | "update";
export type MergeFileKind = "text" | "binary";
export type MergeFileStatus = "clean" | "auto" | "conflict" | "resolved";
export type MergeFileResolution = "local" | "target" | "manual" | null;

export interface MergeSessionFileSummary {
  relativePath: string;
  kind: MergeFileKind;
  status: MergeFileStatus;
  resolution: MergeFileResolution;
  summary: string;
}

export interface MergeSessionSummary {
  sessionId: string;
  operation: MergeOperation;
  action: "ready" | "needs_resolution";
  state: "ready" | "needs_resolution";
  title: string;
  description: string;
  displayName: string;
  sourceLabel: string;
  targetLabel: string;
  cleanCount: number;
  autoCount: number;
  conflictCount: number;
  resolvedCount: number;
  totalCount: number;
  files: MergeSessionFileSummary[];
}

export interface MergeNoOpPreview {
  action: "noop";
  operation: MergeOperation;
  message: string;
}

export type MergePreview = MergeSessionSummary | MergeNoOpPreview;

export interface MergeFileContentView {
  exists: boolean;
  isBinary: boolean;
  text: string | null;
}

export interface MergeSessionFileDetail {
  sessionId: string;
  operation: MergeOperation;
  title: string;
  description: string;
  displayName: string;
  relativePath: string;
  kind: MergeFileKind;
  status: MergeFileStatus;
  resolution: MergeFileResolution;
  summary: string;
  base: MergeFileContentView;
  local: MergeFileContentView;
  target: MergeFileContentView;
  result: MergeFileContentView;
}

export interface ResolveMergeFileRequest {
  sessionId: string;
  relativePath: string;
  resolution: Exclude<MergeFileResolution, null>;
  content?: string;
}

export interface CommitMergeSessionRequest {
  sessionId: string;
}

export interface CommitMergeSessionResponse {
  sessionId: string;
  operation: MergeOperation;
  message: string;
  workspaceRoot?: string;
  instanceId?: string;
  skillId?: string;
  version?: string;
  providers?: Provider[];
}
