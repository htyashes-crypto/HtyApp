export type Provider = "codex" | "claude" | "cursor";

export const ALL_PROVIDERS: Provider[] = ["codex", "claude", "cursor"];

export type RouteKey = "overview" | "library" | "projects" | "activity" | "market" | "composer";
export type WorkspaceKind = "project" | "special";

export interface WorkspaceRecord {
  workspaceId: string;
  name: string;
  rootPath: string;
  createdAt: string;
  kind: WorkspaceKind;
  availableProviders: Provider[];
}

export type InstanceStatus = "bound" | "unbound" | "lost";

export interface LocalInstance {
  instanceId: string;
  workspaceId: string;
  provider: Provider;
  relativePath: string;
  displayName: string;
  linkedSkillId: string | null;
  linkedVersion: string | null;
  appliedSkillId: string | null;
  appliedVersion: string | null;
  status: InstanceStatus;
  indexPath: string;
}

export interface WorkspaceSnapshot {
  workspace: WorkspaceRecord;
  instances: LocalInstance[];
}

export interface ProviderVariantRecord {
  provider: Provider;
  payloadPath: string;
  displayName: string;
}

export interface GlobalVersionRecord {
  skillId: string;
  version: string;
  publishedAt: string;
  notes: string;
  publishedFromWorkspaceId: string | null;
  providers: ProviderVariantRecord[];
}

export interface GlobalSkillSummary {
  skillId: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  latestVersion: string | null;
  latestProviders: Provider[];
  versionCount: number;
  createdAt: string;
}

export interface GlobalSkillDetail {
  skill: GlobalSkillSummary;
  versions: GlobalVersionRecord[];
}

export interface ActivityRecord {
  id: string;
  kind: string;
  title: string;
  detail: string;
  createdAt: string;
}

export interface OutdatedInstance {
  workspaceId: string;
  workspaceName: string;
  workspaceRoot: string;
  instanceId: string;
  instanceName: string;
  provider: Provider;
  currentVersion: string;
  latestVersion: string;
  skillId: string;
  skillName: string;
}

export interface DashboardSummary {
  globalSkillCount: number;
  versionCount: number;
  workspaceCount: number;
  localInstanceCount: number;
  unboundInstanceCount: number;
  outdatedInstances: OutdatedInstance[];
  recentActivities: ActivityRecord[];
  libraryRoot: string;
  storeRoot: string;
}

export interface BatchUpdateItem {
  workspaceRoot: string;
  instanceId: string;
}

export interface BatchUpdateResult {
  updated: number;
  skipped: number;
  conflicted: number;
  failed: number;
  details: Array<{
    instanceId: string;
    status: "updated" | "skipped" | "conflicted" | "failed";
    error?: string;
  }>;
}

export interface AppSettings {
  defaultLibraryRoot: string;
  libraryRoot: string;
  storeRoot: string;
  usingCustomLibraryRoot: boolean;
}

export interface UpdateLibraryRootRequest {
  libraryRoot: string | null;
  moveExisting: boolean;
}

export type PublishMode = "create" | "append";

export interface PublishRequest {
  workspaceRoot: string;
  instanceId: string;
  providers?: Provider[];
  skillMode: PublishMode;
  existingSkillId?: string;
  name?: string;
  slug?: string;
  description?: string;
  tags?: string[];
  notes?: string;
  forceReplace?: boolean;
}

export interface PublishResponse {
  skillId: string;
  version: string;
  providers: Provider[];
}

export interface InstallRequest {
  workspaceRoot: string;
  skillId: string;
  version: string;
  providers?: Provider[];
}

export interface InstalledTarget {
  provider: Provider;
  targetPath: string;
}

export interface InstallResponse {
  workspaceId: string;
  workspaceRoot: string;
  version: string;
  installedTargets: InstalledTarget[];
}

export interface BindRequest {
  workspaceRoot: string;
  instanceId: string;
  skillId: string;
}

export interface UpdateBoundInstanceRequest {
  workspaceRoot: string;
  instanceId: string;
  force?: boolean;
  targetVersion?: string;
}

export interface ExportPackageRequest {
  skillId: string;
  version: string;
  outputPath: string;
}

export interface ImportPackageRequest {
  packagePath: string;
  forceReplace?: boolean;
}

export interface PackageOperationResponse {
  path: string;
  message: string;
}

/* ── Cloud Market ── */

export interface MarketSkillVersion {
  version: string;
  publishedAt: string;
  notes: string;
  providers: Provider[];
  packageUrl: string;
  packageSize: number;
}

export interface MarketSkillEntry {
  skillId: string;
  slug: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
  latestVersion: string;
  latestProviders: Provider[];
  versionCount: number;
  createdAt: string;
  updatedAt: string;
  downloadCount: number;
  versions: MarketSkillVersion[];
}

export interface MarketRegistry {
  schemaVersion: number;
  updatedAt: string;
  skills: MarketSkillEntry[];
}

export interface MarketDownloadRequest {
  registryBaseUrl: string;
  packageUrl: string;
  skillId: string;
  version: string;
  forceReplace?: boolean;
}

export type MarketInstallStatus = "not_installed" | "installed" | "update_available";

/* ── Composer ── */

export interface ComposerFile {
  fileName: string;
  content: string;
}

export interface ComposerWriteRequest {
  dirPath: string;
  files: ComposerFile[];
}

export interface ComposerResolveRequest {
  workspaceRoot: string;
  provider: Provider;
  skillName: string;
}

export interface ComposerResolveResult {
  dirPath: string;
  exists: boolean;
}

export interface ComposerListResult {
  dirs: Array<{ dirName: string; dirPath: string }>;
}

export interface MarketUploadRequest {
  skillId: string;
  version: string;
  githubToken: string;
  owner: string;
  repo: string;
  branch?: string;
  author?: string;
}
