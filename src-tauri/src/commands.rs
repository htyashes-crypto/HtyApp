use tauri::AppHandle;

use crate::models::{
    ActivityRecord, AppSettings, BindRequest, DashboardSummary, ExportPackageRequest,
    GlobalSkillDetail, GlobalSkillSummary, ImportPackageRequest, InstallRequest,
    InstallResponse, LocalInstance, PackageOperationResponse, PublishRequest,
    PublishResponse, UpdateBoundInstanceRequest, UpdateLibraryRootRequest,
    WorkspaceRecord, WorkspaceSnapshot,
};
use crate::service::AppService;

fn with_service<T>(app: &AppHandle, f: impl FnOnce(&AppService) -> anyhow::Result<T>) -> Result<T, String> {
    let service = AppService::from_app(app).map_err(|error| error.to_string())?;
    f(&service).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_dashboard(app: AppHandle) -> Result<DashboardSummary, String> {
    with_service(&app, |service| service.get_dashboard())
}

#[tauri::command]
pub fn get_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    with_service(&app, |service| service.get_app_settings())
}

#[tauri::command]
pub fn update_library_root(app: AppHandle, request: UpdateLibraryRootRequest) -> Result<AppSettings, String> {
    with_service(&app, |service| service.update_library_root(request))
}

#[tauri::command]
pub fn rebuild_library_from_store(app: AppHandle) -> Result<usize, String> {
    with_service(&app, |service| service.rebuild_library_from_store())
}

#[tauri::command]
pub fn list_library(app: AppHandle) -> Result<Vec<GlobalSkillSummary>, String> {
    with_service(&app, |service| service.list_library())
}

#[tauri::command]
pub fn get_skill_detail(app: AppHandle, skill_id: String) -> Result<GlobalSkillDetail, String> {
    with_service(&app, |service| service.get_skill_detail(&skill_id))
}

#[tauri::command]
pub fn list_workspaces(app: AppHandle) -> Result<Vec<WorkspaceRecord>, String> {
    with_service(&app, |service| service.list_workspaces())
}

#[tauri::command]
pub fn scan_workspace(
    app: AppHandle,
    workspace_root: String,
    workspace_name: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    with_service(&app, |service| service.scan_workspace(&workspace_root, workspace_name))
}

#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    workspace_root: String,
    workspace_name: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    with_service(&app, |service| service.watch_workspace(&workspace_root, workspace_name))
}

#[tauri::command]
pub fn publish_to_global(app: AppHandle, request: PublishRequest) -> Result<PublishResponse, String> {
    with_service(&app, |service| service.publish_to_global(request))
}

#[tauri::command]
pub fn install_from_global(app: AppHandle, request: InstallRequest) -> Result<InstallResponse, String> {
    with_service(&app, |service| service.install_from_global(request))
}

#[tauri::command]
pub fn bind_local_instance(app: AppHandle, request: BindRequest) -> Result<LocalInstance, String> {
    with_service(&app, |service| service.bind_local_instance(request))
}

#[tauri::command]
pub fn update_bound_instance(app: AppHandle, request: UpdateBoundInstanceRequest) -> Result<LocalInstance, String> {
    with_service(&app, |service| service.update_bound_instance(request))
}

#[tauri::command]
pub fn list_activity(app: AppHandle) -> Result<Vec<ActivityRecord>, String> {
    with_service(&app, |service| service.list_activity())
}

#[tauri::command]
pub fn create_backup(
    app: AppHandle,
    workspace_root: String,
    relative_path: String,
) -> Result<String, String> {
    with_service(&app, |service| service.create_backup(&workspace_root, &relative_path))
}

#[tauri::command]
pub fn export_package(
    app: AppHandle,
    request: ExportPackageRequest,
) -> Result<PackageOperationResponse, String> {
    with_service(&app, |service| service.export_package(request))
}

#[tauri::command]
pub fn import_package(
    app: AppHandle,
    request: ImportPackageRequest,
) -> Result<PackageOperationResponse, String> {
    with_service(&app, |service| service.import_package(request))
}
