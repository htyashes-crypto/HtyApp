export type Provider = "codex" | "claude" | "cursor";

export const ALL_PROVIDERS: Provider[] = ["codex", "claude", "cursor"];

export type RouteKey = "overview" | "library" | "projects" | "activity";
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

export interface DashboardSummary {
  globalSkillCount: number;
  versionCount: number;
  workspaceCount: number;
  localInstanceCount: number;
  unboundInstanceCount: number;
  recentActivities: ActivityRecord[];
  libraryRoot: string;
  storeRoot: string;
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
}

export interface PackageOperationResponse {
  path: string;
  message: string;
}
