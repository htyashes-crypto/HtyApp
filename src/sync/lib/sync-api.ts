import type {
  SyncProjectData,
  DiffEntry,
  SyncSummary,
  SyncLogEntry,
  SyncLogFileChange,
  BlacklistTemplate,
  ProjectSettings,
  FilterScheme,
  ComputeDiffsRequest,
  SyncFolderRequest,
  BulkSyncRequest,
  AutoSyncRequest,
  DiffTexts
} from "./sync-types";
import { getDesktopBridge } from "../../lib/desktop";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error("desktop runtime unavailable");
  return bridge.invoke<T>(command, args);
}

export const syncApi = {
  // Projects & Repositories
  loadProjects: () => call<SyncProjectData>("sync_load_projects"),
  saveProjects: (data: SyncProjectData) => call<void>("sync_save_projects", { data }),

  // Repository management
  addRepository: (name: string, repoPath: string) => call<{ id: string }>("sync_add_repository", { name, repoPath }),
  removeRepository: (repoId: string) => call<void>("sync_remove_repository", { repoId }),
  renameRepository: (repoId: string, newName: string) => call<void>("sync_rename_repository", { repoId, newName }),
  setRepositoryPath: (repoId: string, repoPath: string) => call<void>("sync_set_repository_path", { repoId, repoPath }),

  // Project management (scoped to repository)
  addProject: (repoId: string, name: string, projectPath: string) => call<void>("sync_add_project", { repoId, name, path: projectPath }),
  removeProject: (repoId: string, name: string) => call<void>("sync_remove_project", { repoId, name }),
  renameProject: (repoId: string, oldName: string, newName: string) => call<void>("sync_rename_project", { repoId, oldName, newName }),

  // Diff / Sync
  computeDiffs: (request: ComputeDiffsRequest) => call<DiffEntry[]>("sync_compute_diffs", request as unknown as Record<string, unknown>),
  syncFolder: (request: SyncFolderRequest) => call<SyncSummary>("sync_folder", request as unknown as Record<string, unknown>),
  bulkSync: (request: BulkSyncRequest) => call<SyncSummary>("sync_bulk_sync", request as unknown as Record<string, unknown>),

  // Blacklist
  loadBlacklist: (projectPath: string) => call<string[]>("sync_load_blacklist", { projectPath }),
  saveBlacklist: (projectPath: string, entries: string[]) => call<void>("sync_save_blacklist", { projectPath, entries }),

  // Templates
  loadTemplates: () => call<BlacklistTemplate[]>("sync_load_templates"),
  saveTemplates: (templates: BlacklistTemplate[]) => call<void>("sync_save_templates", { templates }),
  importTemplates: (filePath: string) => call<BlacklistTemplate[]>("sync_import_templates", { filePath }),
  exportTemplates: (filePath: string, templates: BlacklistTemplate[]) => call<void>("sync_export_templates", { filePath, templates }),

  // Project settings
  loadProjectSettings: (projectPath: string) => call<ProjectSettings>("sync_load_project_settings", { projectPath }),
  saveProjectSettings: (projectPath: string, settings: ProjectSettings) => call<void>("sync_save_project_settings", { projectPath, settings }),

  // Sync logs
  loadSyncLogs: (projectPath: string) => call<SyncLogEntry[]>("sync_load_sync_logs", { projectPath }),
  loadSyncLogDetails: (logId: string) => call<SyncLogFileChange[]>("sync_load_sync_log_details", { logId }),

  // Filter schemes
  loadFilterSchemes: () => call<FilterScheme[]>("sync_load_filter_schemes"),
  saveFilterSchemes: (schemes: FilterScheme[]) => call<void>("sync_save_filter_schemes", { schemes }),

  // Auto-sync
  startAutoSync: (request: AutoSyncRequest) => call<void>("sync_start_auto_sync", request as unknown as Record<string, unknown>),
  stopAutoSync: (projectPath: string) => call<void>("sync_stop_auto_sync", { projectPath }),

  // Utilities
  openInExplorer: (dirPath: string) => call<void>("sync_open_in_explorer", { path: dirPath }),
  openFile: (filePath: string) => call<void>("sync_open_file", { filePath }),
  revealFile: (filePath: string) => call<void>("sync_reveal_file", { filePath }),
  readFileText: (filePath: string) => call<string>("sync_read_file_text", { filePath }),
  readDiffTexts: (projectRoot: string, repoRoot: string, relativePath: string) =>
    call<DiffTexts>("sync_read_diff_texts", { projectRoot, repoRoot, relativePath })
};
