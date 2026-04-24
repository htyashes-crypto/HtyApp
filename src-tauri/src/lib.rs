pub mod commands;
pub mod models;
pub mod service;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_dashboard,
            commands::get_app_settings,
            commands::update_library_root,
            commands::rebuild_library_from_store,
            commands::list_library,
            commands::get_skill_detail,
            commands::list_workspaces,
            commands::scan_workspace,
            commands::watch_workspace,
            commands::publish_to_global,
            commands::install_from_global,
            commands::bind_local_instance,
            commands::update_bound_instance,
            commands::list_activity,
            commands::create_backup,
            commands::export_package,
            commands::import_package,
            commands::deepseek_get_config,
            commands::deepseek_save_config,
            commands::deepseek_enable,
            commands::deepseek_disable
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
