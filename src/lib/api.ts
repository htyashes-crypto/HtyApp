import type {
  ActivityRecord,
  AppSettings,
  BindRequest,
  DashboardSummary,
  ExportPackageRequest,
  GlobalSkillDetail,
  GlobalSkillSummary,
  ImportPackageRequest,
  InstallRequest,
  InstallResponse,
  LocalInstance,
  ComposerFile,
  ComposerListResult,
  ComposerResolveRequest,
  ComposerResolveResult,
  ComposerWriteRequest,
  MarketDownloadRequest,
  MarketRegistry,
  MarketUploadRequest,
  PackageOperationResponse,
  PublishRequest,
  PublishResponse,
  UpdateBoundInstanceRequest,
  UpdateLibraryRootRequest,
  WorkspaceRecord,
  WorkspaceSnapshot
} from "./types";
import type {
  CommitMergeSessionRequest,
  CommitMergeSessionResponse,
  MergePreview,
  MergeSessionFileDetail,
  MergeSessionSummary,
  ResolveMergeFileRequest
} from "./merge-types";
import { getDesktopBridge, isDesktopRuntime } from "./desktop";
import { mockApi } from "./mock";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    throw new Error("desktop runtime unavailable");
  }
  return bridge.invoke<T>(command, args);
}

export const api = {
  async getDashboard(): Promise<DashboardSummary> {
    return isDesktopRuntime()
      ? call<DashboardSummary>("get_dashboard")
      : mockApi.getDashboard();
  },
  async getAppSettings(): Promise<AppSettings> {
    return isDesktopRuntime()
      ? call<AppSettings>("get_app_settings")
      : mockApi.getAppSettings();
  },
  async updateLibraryRoot(request: UpdateLibraryRootRequest): Promise<AppSettings> {
    return isDesktopRuntime()
      ? call<AppSettings>("update_library_root", { request })
      : mockApi.updateLibraryRoot(request);
  },
  async rebuildLibraryFromStore(): Promise<number> {
    return isDesktopRuntime()
      ? call<number>("rebuild_library_from_store")
      : mockApi.rebuildLibraryFromStore();
  },
  async listLibrary(): Promise<GlobalSkillSummary[]> {
    return isDesktopRuntime()
      ? call<GlobalSkillSummary[]>("list_library")
      : mockApi.listLibrary();
  },
  async getSkillDetail(skillId: string): Promise<GlobalSkillDetail> {
    return isDesktopRuntime()
      ? call<GlobalSkillDetail>("get_skill_detail", { skillId })
      : mockApi.getSkillDetail(skillId);
  },
  async listWorkspaces(): Promise<WorkspaceRecord[]> {
    return isDesktopRuntime()
      ? call<WorkspaceRecord[]>("list_workspaces")
      : mockApi.listWorkspaces();
  },
  async scanWorkspace(workspaceRoot: string, workspaceName?: string): Promise<WorkspaceSnapshot> {
    return isDesktopRuntime()
      ? call<WorkspaceSnapshot>("scan_workspace", { workspaceRoot, workspaceName })
      : mockApi.scanWorkspace(workspaceRoot, workspaceName);
  },
  async watchWorkspace(workspaceRoot: string, workspaceName?: string): Promise<WorkspaceSnapshot> {
    return isDesktopRuntime()
      ? call<WorkspaceSnapshot>("watch_workspace", { workspaceRoot, workspaceName })
      : mockApi.watchWorkspace(workspaceRoot, workspaceName);
  },
  async publishToGlobal(request: PublishRequest): Promise<PublishResponse> {
    return isDesktopRuntime()
      ? call<PublishResponse>("publish_to_global", { request })
      : mockApi.publishToGlobal(request);
  },
  async prepareAppendPublishMerge(request: PublishRequest): Promise<MergePreview> {
    return isDesktopRuntime()
      ? call<MergePreview>("prepare_append_publish_merge", { request })
      : mockApi.prepareAppendPublishMerge(request);
  },
  async prepareUpdateMerge(request: UpdateBoundInstanceRequest): Promise<MergePreview> {
    return isDesktopRuntime()
      ? call<MergePreview>("prepare_update_merge", { request })
      : mockApi.prepareUpdateMerge(request);
  },
  async getMergeSession(sessionId: string): Promise<MergeSessionSummary> {
    return isDesktopRuntime()
      ? call<MergeSessionSummary>("get_merge_session", { sessionId })
      : mockApi.getMergeSession(sessionId);
  },
  async getMergeSessionFile(sessionId: string, relativePath: string): Promise<MergeSessionFileDetail> {
    return isDesktopRuntime()
      ? call<MergeSessionFileDetail>("get_merge_session_file", { sessionId, relativePath })
      : mockApi.getMergeSessionFile(sessionId, relativePath);
  },
  async resolveMergeSessionFile(request: ResolveMergeFileRequest): Promise<MergeSessionSummary> {
    return isDesktopRuntime()
      ? call<MergeSessionSummary>("resolve_merge_session_file", { request })
      : mockApi.resolveMergeSessionFile(request);
  },
  async commitMergeSession(request: CommitMergeSessionRequest): Promise<CommitMergeSessionResponse> {
    return isDesktopRuntime()
      ? call<CommitMergeSessionResponse>("commit_merge_session", { request })
      : mockApi.commitMergeSession(request);
  },
  async discardMergeSession(sessionId: string): Promise<{ sessionId: string; message: string }> {
    return isDesktopRuntime()
      ? call<{ sessionId: string; message: string }>("discard_merge_session", { sessionId })
      : mockApi.discardMergeSession(sessionId);
  },
  async installFromGlobal(request: InstallRequest): Promise<InstallResponse> {
    return isDesktopRuntime()
      ? call<InstallResponse>("install_from_global", { request })
      : mockApi.installFromGlobal(request);
  },
  async bindLocalInstance(request: BindRequest): Promise<LocalInstance> {
    return isDesktopRuntime()
      ? call<LocalInstance>("bind_local_instance", { request })
      : mockApi.bindLocalInstance(request);
  },
  async updateBoundInstance(request: UpdateBoundInstanceRequest): Promise<LocalInstance> {
    return isDesktopRuntime()
      ? call<LocalInstance>("update_bound_instance", { request })
      : mockApi.updateBoundInstance(request);
  },
  async listActivity(): Promise<ActivityRecord[]> {
    return isDesktopRuntime()
      ? call<ActivityRecord[]>("list_activity")
      : mockApi.listActivity();
  },
  async createBackup(workspaceRoot: string, relativePath: string): Promise<string> {
    return isDesktopRuntime()
      ? call<string>("create_backup", { workspaceRoot, relativePath })
      : mockApi.createBackup(workspaceRoot, relativePath);
  },
  /* ── Composer ── */

  async composerReadSkillDir(dirPath: string): Promise<{ files: ComposerFile[] }> {
    return isDesktopRuntime()
      ? call<{ files: ComposerFile[] }>("composer_read_skill_dir", { dirPath })
      : mockApi.composerReadSkillDir(dirPath);
  },
  async composerWriteSkillDir(request: ComposerWriteRequest): Promise<{ dirPath: string; message: string }> {
    return isDesktopRuntime()
      ? call<{ dirPath: string; message: string }>("composer_write_skill_dir", { request })
      : mockApi.composerWriteSkillDir(request);
  },
  async composerListSkillDirs(workspaceRoot: string, provider: string): Promise<ComposerListResult> {
    return isDesktopRuntime()
      ? call<ComposerListResult>("composer_list_skill_dirs", { workspaceRoot, provider })
      : mockApi.composerListSkillDirs(workspaceRoot, provider);
  },
  async composerResolveTargetDir(request: ComposerResolveRequest): Promise<ComposerResolveResult> {
    return isDesktopRuntime()
      ? call<ComposerResolveResult>("composer_resolve_target_dir", { request })
      : mockApi.composerResolveTargetDir(request);
  },

  async composerUpdateSkillMetadata(request: { skillId: string; name: string; description: string }): Promise<{ skillId: string; message: string }> {
    return isDesktopRuntime()
      ? call<{ skillId: string; message: string }>("composer_update_skill_metadata", { request })
      : mockApi.composerUpdateSkillMetadata(request);
  },

  async deleteSkill(skillId: string): Promise<{ skillId: string; message: string }> {
    return isDesktopRuntime()
      ? call<{ skillId: string; message: string }>("delete_skill", { skillId })
      : mockApi.deleteSkill(skillId);
  },
  async exportPackage(request: ExportPackageRequest): Promise<PackageOperationResponse> {
    return isDesktopRuntime()
      ? call<PackageOperationResponse>("export_package", { request })
      : mockApi.exportPackage(request);
  },
  async importPackage(request: ImportPackageRequest): Promise<PackageOperationResponse> {
    return isDesktopRuntime()
      ? call<PackageOperationResponse>("import_package", { request })
      : mockApi.importPackage(request);
  },

  /* ── Cloud Market ── */

  async fetchMarketRegistry(registryUrl: string): Promise<MarketRegistry> {
    return isDesktopRuntime()
      ? call<MarketRegistry>("market_fetch_registry", { registryUrl })
      : mockApi.fetchMarketRegistry(registryUrl);
  },
  async marketDownloadAndImport(request: MarketDownloadRequest): Promise<PackageOperationResponse> {
    return isDesktopRuntime()
      ? call<PackageOperationResponse>("market_download_and_import", { request })
      : mockApi.marketDownloadAndImport(request);
  },
  async marketUploadPackage(request: MarketUploadRequest): Promise<{ message: string }> {
    return isDesktopRuntime()
      ? call<{ message: string }>("market_upload_package", { request })
      : mockApi.marketUploadPackage(request);
  },
  async getMarketSettings(): Promise<{ registryUrl: string }> {
    return isDesktopRuntime()
      ? call<{ registryUrl: string }>("get_market_settings")
      : mockApi.getMarketSettings();
  },
  async updateMarketSettings(request: { registryUrl: string }): Promise<{ registryUrl: string }> {
    return isDesktopRuntime()
      ? call<{ registryUrl: string }>("update_market_settings", { request })
      : mockApi.updateMarketSettings(request);
  }
};
