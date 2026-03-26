export type SyncMode = "All" | "Script" | "Meta" | "ScriptMeta" | "Other";

export type AutoSyncMode =
  | "RepoToProjectAll"
  | "RepoToProjectScripts"
  | "ProjectToRepoAll"
  | "ProjectToRepoScripts";

export type DiffStatus = "modified" | "added" | "deleted" | "conflict";

export type SyncDirection = "RepoToProject" | "ProjectToRepo";

export type SyncPanel = "timeline" | "pending" | "blacklist" | "logs";

export interface SyncProject {
  name: string;
  path: string;
}

// Storage format matches C# PascalCase for data compatibility
export interface SyncProjectItem {
  Name: string;
  Path: string;
}

export interface SyncRepository {
  Id: string;
  Name: string;
  RepositoryPath: string;
  Projects: SyncProjectItem[];
}

export interface SyncProjectData {
  Version: number;
  Repositories: SyncRepository[];
}

// Diff engine output (camelCase from our Node.js backend)
export interface DiffEntry {
  status: DiffStatus;
  relativePath: string;
  sizeBytes: number;
  modifiedTime: string;
  modifiedTimeMs: number;
  extension: string;
  addedLines: number;
  deletedLines: number;
  modifiedLines: number;
  codeChangeSummary: string;
}

export interface SyncSummary {
  copied: number;
  overwritten: number;
  deleted: number;
}

// Storage format matches C# PascalCase
export interface SyncLogEntry {
  LogId: string;
  Time: string;
  ProjectPath: string;
  RepositoryPath: string;
  Operation: string;
  Direction: string;
  Mode: string;
  Copied: number;
  Overwritten: number;
  Deleted: number;
  Result: string;
  Message: string;
}

export interface SyncLogFileChange {
  Path: string;
  Action: string;
}

// Storage format matches C# PascalCase
export interface BlacklistTemplate {
  Name: string;
  Items: string[];
}

// Storage format matches C# PascalCase
export interface ProjectSettings {
  AutoSyncEnabled: boolean;
  AutoSyncIntervalMinutes: number;
  AutoSyncMode: AutoSyncMode;
}

// Storage format matches C# PascalCase
export interface FilterScheme {
  Name: string;
  IncludeModified: boolean;
  IncludeAdded: boolean;
  IncludeDeleted: boolean;
  IncludeConflict: boolean;
  Extensions: string;
  PathContains: string;
  MinSizeKB: number | null;
  MaxSizeKB: number | null;
  StartDate: string | null;
  EndDate: string | null;
}

export interface ComputeDiffsRequest {
  projectRoot: string;
  repoRoot: string;
  syncMode: SyncMode;
  blacklistDirs: string[];
}

export interface SyncFolderRequest {
  sourceDir: string;
  targetDir: string;
  mode: SyncMode;
  verifyContent: boolean;
  blacklist: string[];
  projectPath: string;
  repoPath: string;
  operation: string;
  direction: SyncDirection;
}

export interface BulkSyncRequest {
  entries: string[];
  projectRoot: string;
  repoRoot: string;
  direction: SyncDirection;
  blacklist: string[];
}

export interface AutoSyncRequest {
  projectPath: string;
  repoPath: string;
  intervalMinutes: number;
  mode: AutoSyncMode;
}

export interface ScanProgress {
  done: number;
  total: number;
}

export interface BulkProgress {
  done: number;
  total: number;
  speed: string;
  eta: string;
}

export interface DiffTexts {
  projectText: string | null;
  repoText: string | null;
  projectPath: string;
  repoPath: string;
  projectExists: boolean;
  repoExists: boolean;
}
