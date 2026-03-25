use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::models::{
    ActivityRecord, AppSettings, BindRequest, DashboardSummary, ExportPackageRequest,
    GlobalSkillDetail, GlobalSkillSummary, GlobalVersionRecord, ImportPackageRequest,
    InstallRequest, InstallResponse, InstalledTarget, InstanceStatus, LocalIndexFile,
    LocalInstance, PackageManifest, PackageOperationResponse, Provider,
    ProviderVariantRecord, PublishMode, PublishRequest, PublishResponse,
    UpdateBoundInstanceRequest, UpdateLibraryRootRequest, WorkspaceKind,
    WorkspaceRecord, WorkspaceSnapshot,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BootstrapConfig {
    library_root_override: Option<String>,
}

const SPECIAL_WORKSPACE_ID: &str = "workspace_special_provider_global";
const SPECIAL_WORKSPACE_NAME: &str = "特殊工作区";
const SPECIAL_WORKSPACE_ROOT: &str = "hty://workspace/provider-global";
const SPECIAL_WORKSPACE_CREATED_AT: &str = "1970-01-01T00:00:00Z";
const SPECIAL_WORKSPACE_STORAGE_NAME: &str = "provider-global";

#[derive(Debug, Clone)]
enum WorkspaceFsContext {
    Standard { root_path: PathBuf },
    SpecialProviderGlobal,
}

pub struct AppService {
    default_base_dir: PathBuf,
    bootstrap_path: PathBuf,
    base_dir: PathBuf,
    db_path: PathBuf,
    store_dir: PathBuf,
}

impl AppService {
    pub fn from_app(app: &AppHandle) -> Result<Self> {
        let default_base_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| anyhow!("failed to resolve app data directory: {error}"))?;
        Self::from_default_base_dir(default_base_dir)
    }

    pub fn from_base_dir(base_dir: PathBuf) -> Result<Self> {
        Self::from_default_base_dir(base_dir)
    }

    fn from_default_base_dir(default_base_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&default_base_dir)?;
        let bootstrap_path = default_base_dir.join("settings.json");
        let mut bootstrap = load_bootstrap_config(&bootstrap_path)?;
        let base_dir = if let Some(override_root) = bootstrap
            .library_root_override
            .as_ref()
            .map(PathBuf::from)
        {
            if !override_root.is_dir() {
                fs::create_dir_all(&override_root)?;
            }
            override_root
        } else {
            default_base_dir.clone()
        };

        let service = Self {
            default_base_dir,
            bootstrap_path,
            db_path: base_dir.join("library.db"),
            store_dir: base_dir.join("store").join("skills"),
            base_dir,
        };
        service.init()?;
        Ok(service)
    }

    pub fn get_dashboard(&self) -> Result<DashboardSummary> {
        let conn = self.connection()?;
        let global_skill_count = count_query(&conn, "SELECT COUNT(*) FROM global_skills")?;
        let version_count = count_query(&conn, "SELECT COUNT(*) FROM global_versions")?;
        let workspaces = self.list_workspaces()?;
        let workspace_count = workspaces.len();
        let mut local_instance_count = 0usize;
        let mut unbound_instance_count = 0usize;

        for workspace in &workspaces {
            if let Ok(snapshot) = self.scan_workspace(&workspace.root_path, Some(workspace.name.clone())) {
                local_instance_count += snapshot.instances.len();
                unbound_instance_count += snapshot
                    .instances
                    .iter()
                    .filter(|instance| matches!(instance.status, InstanceStatus::Unbound))
                    .count();
            }
        }

        Ok(DashboardSummary {
            global_skill_count,
            version_count,
            workspace_count,
            local_instance_count,
            unbound_instance_count,
            recent_activities: self.list_activity()?,
            library_root: self.base_dir.to_string_lossy().to_string(),
            store_root: self.store_dir.to_string_lossy().to_string(),
        })
    }

    pub fn get_app_settings(&self) -> Result<AppSettings> {
        Ok(AppSettings {
            default_library_root: self.default_base_dir.to_string_lossy().to_string(),
            library_root: self.base_dir.to_string_lossy().to_string(),
            store_root: self.store_dir.to_string_lossy().to_string(),
            using_custom_library_root: !paths_match(&self.base_dir, &self.default_base_dir),
        })
    }

    pub fn update_library_root(&self, request: UpdateLibraryRootRequest) -> Result<AppSettings> {
        let target_base_dir = request
            .library_root
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| self.default_base_dir.clone());

        if request.move_existing && !paths_match(&target_base_dir, &self.base_dir) {
            self.copy_library_data(&target_base_dir)?;
        }

        fs::create_dir_all(&target_base_dir)?;

        self.write_bootstrap_config(&BootstrapConfig {
            library_root_override: if paths_match(&target_base_dir, &self.default_base_dir) {
                None
            } else {
                Some(target_base_dir.to_string_lossy().to_string())
            },
        })?;

        let next_service = Self::from_default_base_dir(self.default_base_dir.clone())?;
        next_service.append_activity(
            "settings",
            "更新全局库路径".to_string(),
            format!(
                "全局库已切换到 {}{}",
                next_service.base_dir.display(),
                if request.move_existing { "，并复制了现有全局库数据" } else { "" }
            ),
        )?;
        next_service.get_app_settings()
    }

    pub fn rebuild_library_from_store(&self) -> Result<usize> {
        if !self.store_dir.is_dir() {
            return Ok(0);
        }

        let mut conn = self.connection()?;
        let tx = conn.transaction()?;
        let now = now_iso();
        let mut recovered_count = 0usize;

        for skill_entry in fs::read_dir(&self.store_dir)? {
            let skill_entry = skill_entry?;
            let skill_id = skill_entry.file_name().to_string_lossy().to_string();
            if !skill_entry.path().is_dir() || !skill_id.starts_with("skill_") {
                continue;
            }

            let already_exists: bool = tx
                .query_row(
                    "SELECT COUNT(*) FROM global_skills WHERE skill_id = ?1",
                    [skill_id.as_str()],
                    |row| row.get::<_, usize>(0),
                )
                .map(|count| count > 0)?;
            if already_exists {
                continue;
            }

            let mut versions: Vec<(String, String)> = Vec::new();
            let mut first_display_name: Option<String> = None;

            for version_entry in fs::read_dir(skill_entry.path())? {
                let version_entry = version_entry?;
                let version = version_entry.file_name().to_string_lossy().to_string();
                if !version_entry.path().is_dir() {
                    continue;
                }

                let modified = version_entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| {
                        let dt: chrono::DateTime<Utc> = t.into();
                        Some(dt.to_rfc3339_opts(SecondsFormat::Secs, true))
                    })
                    .unwrap_or_else(|| now.clone());

                for provider_entry in fs::read_dir(version_entry.path())? {
                    let provider_entry = provider_entry?;
                    let provider_name = provider_entry.file_name().to_string_lossy().to_string();
                    if !provider_entry.path().is_dir() {
                        continue;
                    }
                    let provider = match provider_from_string(&provider_name) {
                        Ok(p) => p,
                        Err(_) => continue,
                    };

                    for display_entry in fs::read_dir(provider_entry.path())? {
                        let display_entry = display_entry?;
                        let display_name = display_entry.file_name().to_string_lossy().to_string();
                        if !display_entry.path().is_dir() {
                            continue;
                        }

                        if first_display_name.is_none() {
                            first_display_name = Some(display_name.clone());
                        }

                        let payload_path = PathBuf::from("store")
                            .join("skills")
                            .join(&skill_id)
                            .join(&version)
                            .join(provider.as_str())
                            .join(&display_name);

                        let version_variant_exists: bool = tx
                            .query_row(
                                "SELECT COUNT(*) FROM version_variants WHERE skill_id = ?1 AND version = ?2 AND provider = ?3",
                                params![skill_id.as_str(), version.as_str(), provider.as_str()],
                                |row| row.get::<_, usize>(0),
                            )
                            .map(|count| count > 0)?;
                        if !version_variant_exists {
                            tx.execute(
                                "INSERT INTO version_variants (skill_id, version, provider, payload_path, display_name)
                                 VALUES (?1, ?2, ?3, ?4, ?5)",
                                params![
                                    skill_id.as_str(),
                                    version.as_str(),
                                    provider.as_str(),
                                    normalize_path(&payload_path),
                                    display_name.as_str(),
                                ],
                            )?;
                        }
                    }
                }

                let version_exists: bool = tx
                    .query_row(
                        "SELECT COUNT(*) FROM global_versions WHERE skill_id = ?1 AND version = ?2",
                        params![skill_id.as_str(), version.as_str()],
                        |row| row.get::<_, usize>(0),
                    )
                    .map(|count| count > 0)?;
                if !version_exists {
                    tx.execute(
                        "INSERT INTO global_versions (skill_id, version, published_at, notes, published_from_workspace_id)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![skill_id.as_str(), version.as_str(), modified, "", Option::<String>::None],
                    )?;
                }

                versions.push((version, modified));
            }

            if versions.is_empty() {
                continue;
            }

            let name = first_display_name.unwrap_or_else(|| skill_id.clone());
            let slug = self.unique_slug(&tx, &name)?;
            let earliest = versions.iter().map(|(_, t)| t.as_str()).min().unwrap_or(&now);
            let latest = versions.iter().map(|(_, t)| t.as_str()).max().unwrap_or(&now);

            tx.execute(
                "INSERT INTO global_skills (skill_id, slug, name, description, tags_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    skill_id.as_str(),
                    slug,
                    name,
                    "",
                    "[]",
                    earliest,
                    latest,
                ],
            )?;
            recovered_count += 1;
        }

        tx.commit()?;

        if recovered_count > 0 {
            self.append_activity(
                "rebuild",
                format!("从 store 恢复了 {} 个 Skill", recovered_count),
                "数据库记录已根据 store 目录结构重建。".to_string(),
            )?;
        }

        Ok(recovered_count)
    }

    pub fn list_library(&self) -> Result<Vec<GlobalSkillSummary>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            "SELECT skill_id, slug, name, description, tags_json, created_at, updated_at
             FROM global_skills
             ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            let skill_id: String = row.get(0)?;
            let tags_json: String = row.get(4)?;
            Ok((
                skill_id,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                tags_json,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })?;

        let mut skills = Vec::new();
        for row in rows {
            let (skill_id, slug, name, description, tags_json, created_at, updated_at) = row?;
            let latest_version: Option<String> = conn
                .query_row(
                    "SELECT version FROM global_versions WHERE skill_id = ?1 ORDER BY published_at DESC LIMIT 1",
                    [skill_id.as_str()],
                    |row| row.get(0),
                )
                .optional()?;
            let version_count = count_query_with_param(
                &conn,
                "SELECT COUNT(*) FROM global_versions WHERE skill_id = ?1",
                skill_id.as_str(),
            )?;
            let latest_providers = if let Some(version) = &latest_version {
                self.load_version_variants(&conn, &skill_id, version)?
                    .into_iter()
                    .map(|variant| variant.provider)
                    .collect()
            } else {
                Vec::new()
            };

            skills.push(GlobalSkillSummary {
                skill_id,
                slug,
                name,
                description,
                tags: parse_tags(&tags_json),
                latest_version,
                latest_providers,
                version_count,
                created_at,
                updated_at,
            });
        }

        Ok(skills)
    }

    pub fn get_skill_detail(&self, skill_id: &str) -> Result<GlobalSkillDetail> {
        let conn = self.connection()?;
        let skill = self
            .list_library()?
            .into_iter()
            .find(|entry| entry.skill_id == skill_id)
            .ok_or_else(|| anyhow!("skill not found: {skill_id}"))?;

        let mut stmt = conn.prepare(
            "SELECT version, published_at, notes, published_from_workspace_id
             FROM global_versions
             WHERE skill_id = ?1
             ORDER BY published_at DESC",
        )?;
        let version_rows = stmt.query_map([skill_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?;

        let mut versions = Vec::new();
        for row in version_rows {
            let (version, published_at, notes, published_from_workspace_id) = row?;
            let providers = self.load_version_variants(&conn, skill_id, &version)?;
            versions.push(GlobalVersionRecord {
                skill_id: skill_id.to_string(),
                version,
                published_at,
                notes,
                published_from_workspace_id,
                providers,
            });
        }

        Ok(GlobalSkillDetail { skill, versions })
    }

    pub fn list_workspaces(&self) -> Result<Vec<WorkspaceRecord>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            "SELECT workspace_id, name, root_path, created_at
             FROM workspaces
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(WorkspaceRecord {
                workspace_id: row.get(0)?,
                name: row.get(1)?,
                root_path: row.get(2)?,
                created_at: row.get(3)?,
                kind: WorkspaceKind::Project,
                available_providers: Provider::all(),
            })
        })?;

        let mut workspaces = vec![self.special_workspace_record()];
        for row in rows {
            workspaces.push(row?);
        }
        Ok(workspaces)
    }

    pub fn scan_workspace(&self, workspace_root: &str, name: Option<String>) -> Result<WorkspaceSnapshot> {
        let context = self.resolve_workspace_context(workspace_root)?;
        let workspace = self.workspace_record_for_context(&context, name)?;
        let indexes_dir = self.indexes_dir_for_context(&context);
        fs::create_dir_all(&indexes_dir)?;

        let mut existing_indexes = self.load_index_map(&indexes_dir)?;
        let mut instances = Vec::new();

        for provider in Provider::all() {
            let Some(provider_root) = self.scan_provider_root(&context, provider) else {
                continue;
            };
            if !provider_root.exists() {
                continue;
            }

            for entry in fs::read_dir(&provider_root)
                .with_context(|| format!("failed to read provider root: {}", provider_root.display()))?
            {
                let entry = entry?;
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }

                let display_name = entry.file_name().to_string_lossy().to_string();
                if display_name.starts_with('.') {
                    continue;
                }

                let relative_path = self.relative_path_for_context(&context, &path)?;
                let key = index_key(provider, &relative_path);
                let now = now_iso();

                let (index_path, mut index) = if let Some((index_path, index)) = existing_indexes.remove(&key) {
                    (index_path, index)
                } else {
                    let instance_id = uuid::Uuid::new_v4().to_string();
                    (
                        indexes_dir.join(format!("{instance_id}.htyVersion")),
                        LocalIndexFile {
                            schema_version: 1,
                            instance_id,
                            workspace_root: workspace_root.to_string(),
                            provider,
                            relative_path: relative_path.clone(),
                            linked_skill_id: None,
                            linked_version: None,
                            display_name: display_name.clone(),
                            created_at: now.clone(),
                            updated_at: now.clone(),
                        },
                    )
                };

                index.workspace_root = workspace_root.to_string();
                index.provider = provider;
                index.relative_path = relative_path.clone();
                index.display_name = display_name;
                index.updated_at = now.clone();
                self.write_index_file(&index_path, &index)?;

                instances.push(LocalInstance {
                    instance_id: index.instance_id.clone(),
                    workspace_id: workspace.workspace_id.clone(),
                    provider,
                    relative_path: index.relative_path.clone(),
                    display_name: index.display_name.clone(),
                    linked_skill_id: index.linked_skill_id.clone(),
                    linked_version: index.linked_version.clone(),
                    updated_at: index.updated_at.clone(),
                    status: if index.linked_skill_id.is_some() {
                        InstanceStatus::Bound
                    } else {
                        InstanceStatus::Unbound
                    },
                    index_path: self.display_index_path(&context, &index_path)?,
                });
            }
        }

        instances.sort_by(|left, right| {
            left.provider
                .as_str()
                .cmp(right.provider.as_str())
                .then(left.display_name.cmp(&right.display_name))
        });

        Ok(WorkspaceSnapshot { workspace, instances })
    }

    pub fn watch_workspace(&self, workspace_root: &str, name: Option<String>) -> Result<WorkspaceSnapshot> {
        self.scan_workspace(workspace_root, name)
    }

    pub fn list_activity(&self) -> Result<Vec<ActivityRecord>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, kind, title, detail, created_at
             FROM activity_log
             ORDER BY created_at DESC
             LIMIT 30",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ActivityRecord {
                id: row.get(0)?,
                kind: row.get(1)?,
                title: row.get(2)?,
                detail: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        let mut activities = Vec::new();
        for row in rows {
            activities.push(row?);
        }
        Ok(activities)
    }

    pub fn bind_local_instance(&self, request: BindRequest) -> Result<LocalInstance> {
        let context = self.resolve_workspace_context(&request.workspace_root)?;
        let indexes_dir = self.indexes_dir_for_context(&context);
        let (index_path, mut index) = self.find_index_by_instance_id(&indexes_dir, &request.instance_id)?;
        let existing_indexes = self.load_index_map(&indexes_dir)?;
        if existing_indexes.values().any(|(_, existing)| {
            existing.instance_id != request.instance_id
                && existing.provider == index.provider
                && existing.linked_skill_id.as_deref() == Some(request.skill_id.as_str())
                && existing.linked_version.as_deref() == Some(request.version.as_str())
        }) {
            return Err(anyhow!(
                "同一个全局版本在当前工作区的同一 provider 下只能绑定一个本地实例。"
            ));
        }

        self.ensure_version_exists(&request.skill_id, &request.version)?;
        index.linked_skill_id = Some(request.skill_id);
        index.linked_version = Some(request.version);
        index.updated_at = now_iso();
        self.write_index_file(&index_path, &index)?;

        let workspace = self.workspace_record_for_context(&context, None)?;
        let index_display_path = self.display_index_path(&context, &index_path)?;
        local_instance_from_index(&workspace, index_display_path, &index)
    }

    pub fn update_bound_instance(&self, request: UpdateBoundInstanceRequest) -> Result<LocalInstance> {
        let context = self.resolve_workspace_context(&request.workspace_root)?;
        let workspace = self.workspace_record_for_context(&context, None)?;
        let indexes_dir = self.indexes_dir_for_context(&context);
        let (index_path, mut index) = self.find_index_by_instance_id(&indexes_dir, &request.instance_id)?;
        let skill_id = index
            .linked_skill_id
            .clone()
            .ok_or_else(|| anyhow!("只能更新已绑定实例。"))?;
        let version = index
            .linked_version
            .clone()
            .ok_or_else(|| anyhow!("只能更新已绑定实例。"))?;

        let conn = self.connection()?;
        let variant = self
            .load_version_variants(&conn, &skill_id, &version)?
            .into_iter()
            .find(|variant| variant.provider == index.provider)
            .ok_or_else(|| anyhow!(
                "当前绑定版本不存在 {} provider 变体。",
                index.provider.as_str()
            ))?;

        let source_dir = self.base_dir.join(&variant.payload_path);
        if !source_dir.exists() {
            return Err(anyhow!("variant payload missing: {}", source_dir.display()));
        }

        let provider_root = self.install_provider_root(&context, index.provider)?;
        if matches!(context, WorkspaceFsContext::Standard { .. }) {
            fs::create_dir_all(&provider_root)?;
        }

        let target_dir = self.resolve_instance_source_dir(&context, &index)?;
        if target_dir.exists() {
            self.backup_target_for_context(&context, &target_dir, index.provider)?;
            fs::remove_dir_all(&target_dir)?;
        } else if let Some(parent) = target_dir.parent() {
            fs::create_dir_all(parent)?;
        }
        copy_directory(&source_dir, &target_dir)?;

        index.updated_at = now_iso();
        self.write_index_file(&index_path, &index)?;
        self.append_activity(
            "update",
            format!("更新 {}", index.display_name),
            format!(
                "已从 {} {} 的 {} provider 变体覆盖 {} 中的本地实例。",
                skill_id,
                version,
                index.provider.as_str(),
                workspace.name
            ),
        )?;

        let index_display_path = self.display_index_path(&context, &index_path)?;
        local_instance_from_index(&workspace, index_display_path, &index)
    }

    pub fn publish_to_global(&self, request: PublishRequest) -> Result<PublishResponse> {
        let context = self.resolve_workspace_context(&request.workspace_root)?;
        let workspace = self.workspace_record_for_context(&context, None)?;
        let indexes_dir = self.indexes_dir_for_context(&context);
        let (index_path, mut index) = self.find_index_by_instance_id(&indexes_dir, &request.instance_id)?;
        let source_dir = self.resolve_instance_source_dir(&context, &index)?;
        if !source_dir.exists() {
            return Err(anyhow!("source instance does not exist: {}", source_dir.display()));
        }

        let providers = normalize_publish_providers(request.providers);
        let mut conn = self.connection()?;
        let tx = conn.transaction()?;
        let now = now_iso();

        let (skill_id, version) = match request.skill_mode {
            PublishMode::Create => {
                let name = request.name.clone().unwrap_or_else(|| index.display_name.clone());
                let slug_seed = request.slug.clone().unwrap_or_else(|| name.clone());
                let slug = self.unique_slug(&tx, &slug_seed)?;
                let skill_id = format!("skill_{}", uuid::Uuid::new_v4().simple());
                tx.execute(
                    "INSERT INTO global_skills (skill_id, slug, name, description, tags_json, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        skill_id.as_str(),
                        slug,
                        name,
                        request.description.clone().unwrap_or_default(),
                        serde_json::to_string(&request.tags.clone().unwrap_or_default())?,
                        now.as_str(),
                        now.as_str(),
                    ],
                )?;
                (skill_id, "1.0.0".to_string())
            }
            PublishMode::Append => {
                let skill_id = request
                    .existing_skill_id
                    .clone()
                    .ok_or_else(|| anyhow!("existingSkillId is required when appending"))?;
                let latest_version = tx
                    .query_row(
                        "SELECT version FROM global_versions WHERE skill_id = ?1 ORDER BY published_at DESC LIMIT 1",
                        [skill_id.as_str()],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()?;
                let next_version = latest_version
                    .as_deref()
                    .map(bump_patch_version)
                    .transpose()?
                    .unwrap_or_else(|| "1.0.0".to_string());
                tx.execute(
                    "UPDATE global_skills SET updated_at = ?2 WHERE skill_id = ?1",
                    params![skill_id.as_str(), now.as_str()],
                )?;
                (skill_id, next_version)
            }
        };

        tx.execute(
            "INSERT INTO global_versions (skill_id, version, published_at, notes, published_from_workspace_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                skill_id.as_str(),
                version.as_str(),
                now.as_str(),
                request.notes.clone().unwrap_or_default(),
                workspace.workspace_id.as_str(),
            ],
        )?;

        for provider in &providers {
            let target_dir = self
                .store_dir
                .join(&skill_id)
                .join(&version)
                .join(provider.as_str())
                .join(sanitize_filename::sanitize(&index.display_name));
            copy_directory(&source_dir, &target_dir)?;
            let payload_path = normalize_path(target_dir.strip_prefix(&self.base_dir)?);
            tx.execute(
                "INSERT INTO version_variants (skill_id, version, provider, payload_path, display_name)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    skill_id.as_str(),
                    version.as_str(),
                    provider.as_str(),
                    payload_path,
                    index.display_name.as_str(),
                ],
            )?;
        }

        tx.commit()?;

        index.linked_skill_id = Some(skill_id.clone());
        index.linked_version = Some(version.clone());
        index.updated_at = now_iso();
        self.write_index_file(&index_path, &index)?;
        self.append_activity(
            "publish",
            format!("发布 {} {}", index.display_name, version),
            format!(
                "从 {} 上传到全局，生成 {} 个 provider 变体。",
                workspace.name,
                providers.len()
            ),
        )?;

        Ok(PublishResponse {
            skill_id,
            version,
            providers,
        })
    }

    pub fn install_from_global(&self, request: InstallRequest) -> Result<InstallResponse> {
        let context = self.resolve_workspace_context(&request.workspace_root)?;
        let workspace = self.workspace_record_for_context(&context, None)?;
        let conn = self.connection()?;
        let available_variants = self.load_version_variants(&conn, &request.skill_id, &request.version)?;
        if available_variants.is_empty() {
            return Err(anyhow!("version has no provider variants"));
        }

        let requested_providers = request.providers.unwrap_or_else(|| {
            available_variants
                .iter()
                .map(|variant| variant.provider)
                .collect::<Vec<_>>()
        });

        let indexes_dir = self.indexes_dir_for_context(&context);
        fs::create_dir_all(&indexes_dir)?;
        let existing_indexes = self.load_index_map(&indexes_dir)?;

        let mut installed_targets = Vec::new();
        for provider in requested_providers {
            let variant = available_variants
                .iter()
                .find(|variant| variant.provider == provider)
                .ok_or_else(|| anyhow!("requested provider variant does not exist: {}", provider.as_str()))?;
            let source_dir = self.base_dir.join(&variant.payload_path);
            if !source_dir.exists() {
                return Err(anyhow!("variant payload missing: {}", source_dir.display()));
            }

            if workspace.kind == WorkspaceKind::Special && !workspace.available_providers.contains(&provider) {
                return Err(anyhow!(
                    "特殊工作区未发现 {} 对应的全局路径，不能安装该 provider。",
                    provider.as_str()
                ));
            }

            let provider_root = self.install_provider_root(&context, provider)?;
            if matches!(context, WorkspaceFsContext::Standard { .. }) {
                fs::create_dir_all(&provider_root)?;
            }
            let target_dir = provider_root.join(&variant.display_name);
            if target_dir.exists() {
                self.backup_target_for_context(&context, &target_dir, provider)?;
                fs::remove_dir_all(&target_dir)?;
            }
            copy_directory(&source_dir, &target_dir)?;

            let relative_path = self.relative_path_for_context(&context, &target_dir)?;
            let key = index_key(provider, &relative_path);
            let (index_path, mut index) = if let Some((path, index)) = existing_indexes.get(&key) {
                (path.clone(), index.clone())
            } else {
                let instance_id = uuid::Uuid::new_v4().to_string();
                (
                    indexes_dir.join(format!("{instance_id}.htyVersion")),
                    LocalIndexFile {
                        schema_version: 1,
                        instance_id,
                        workspace_root: request.workspace_root.clone(),
                        provider,
                        relative_path: relative_path.clone(),
                        linked_skill_id: None,
                        linked_version: None,
                        display_name: variant.display_name.clone(),
                        created_at: now_iso(),
                        updated_at: now_iso(),
                    },
                )
            };

            index.workspace_root = request.workspace_root.clone();
            index.provider = provider;
            index.relative_path = relative_path.clone();
            index.display_name = variant.display_name.clone();
            index.linked_skill_id = Some(request.skill_id.clone());
            index.linked_version = Some(request.version.clone());
            index.updated_at = now_iso();
            self.write_index_file(&index_path, &index)?;

            installed_targets.push(InstalledTarget {
                provider,
                target_path: relative_path,
            });
        }

        self.append_activity(
            "install",
            format!("安装 {} {}", request.skill_id, request.version),
            format!(
                "安装到工作区 {}，覆盖 {} 个 provider 目标。",
                workspace.name,
                installed_targets.len()
            ),
        )?;

        Ok(InstallResponse {
            workspace_id: workspace.workspace_id,
            workspace_root: workspace.root_path,
            version: request.version,
            installed_targets,
        })
    }

    pub fn create_backup(&self, workspace_root: &str, relative_path: &str) -> Result<String> {
        let context = self.resolve_workspace_context(workspace_root)?;
        match &context {
            WorkspaceFsContext::Standard { root_path } => self.backup_existing_target(root_path, relative_path),
            WorkspaceFsContext::SpecialProviderGlobal => {
                let target = PathBuf::from(relative_path);
                let provider = self
                    .special_provider_from_target_path(&target)
                    .ok_or_else(|| anyhow!("无法从目标路径识别 provider: {}", target.display()))?;
                self.backup_target_for_context(&context, &target, provider)
            }
        }
    }

    pub fn export_package(&self, request: ExportPackageRequest) -> Result<PackageOperationResponse> {
        let detail = self.get_skill_detail(&request.skill_id)?;
        let version = detail
            .versions
            .iter()
            .find(|entry| entry.version == request.version)
            .ok_or_else(|| anyhow!("version not found: {}", request.version))?;
        let output_path = PathBuf::from(&request.output_path);
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let file = File::create(&output_path)?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        let manifest = PackageManifest {
            schema_version: 1,
            exported_at: now_iso(),
            skill_id: detail.skill.skill_id.clone(),
            slug: detail.skill.slug.clone(),
            name: detail.skill.name.clone(),
            description: detail.skill.description.clone(),
            tags: detail.skill.tags.clone(),
            version: version.version.clone(),
            published_at: version.published_at.clone(),
            notes: version.notes.clone(),
            published_from_workspace_id: version.published_from_workspace_id.clone(),
            variants: version.providers.clone(),
        };
        zip.start_file("manifest.json", options)?;
        zip.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;

        for variant in &version.providers {
            let source_dir = self.base_dir.join(&variant.payload_path);
            for entry in WalkDir::new(&source_dir) {
                let entry = entry?;
                let relative = entry.path().strip_prefix(&source_dir)?;
                let archive_base = PathBuf::from("payload")
                    .join(variant.provider.as_str())
                    .join(&variant.display_name);
                let archive_path = archive_base.join(relative);
                let archive_path_string = normalize_path(&archive_path);
                if entry.file_type().is_dir() {
                    if !relative.as_os_str().is_empty() {
                        zip.add_directory(archive_path_string, options)?;
                    }
                } else {
                    zip.start_file(archive_path_string, options)?;
                    let mut source_file = File::open(entry.path())?;
                    let mut buffer = Vec::new();
                    source_file.read_to_end(&mut buffer)?;
                    zip.write_all(&buffer)?;
                }
            }
        }

        zip.finish()?;
        self.append_activity(
            "export",
            format!("导出 {} {}", detail.skill.name, request.version),
            format!("导出到 {}", output_path.display()),
        )?;

        Ok(PackageOperationResponse {
            path: output_path.to_string_lossy().to_string(),
            message: "package exported".to_string(),
        })
    }

    pub fn import_package(&self, request: ImportPackageRequest) -> Result<PackageOperationResponse> {
        let package_path = PathBuf::from(&request.package_path);
        let file = File::open(&package_path)?;
        let mut archive = ZipArchive::new(file)?;
        let manifest: PackageManifest = {
            let mut manifest_file = archive.by_name("manifest.json")?;
            let mut content = String::new();
            manifest_file.read_to_string(&mut content)?;
            serde_json::from_str(&content)?
        };

        self.ensure_version_not_exists(&manifest.skill_id, &manifest.version)?;
        let mut conn = self.connection()?;
        let tx = conn.transaction()?;
        let skill_exists = tx
            .query_row(
                "SELECT skill_id FROM global_skills WHERE skill_id = ?1",
                [manifest.skill_id.as_str()],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if skill_exists.is_none() {
            tx.execute(
                "INSERT INTO global_skills (skill_id, slug, name, description, tags_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    manifest.skill_id.as_str(),
                    manifest.slug.as_str(),
                    manifest.name.as_str(),
                    manifest.description.as_str(),
                    serde_json::to_string(&manifest.tags)?,
                    manifest.exported_at.as_str(),
                    manifest.exported_at.as_str(),
                ],
            )?;
        }
        tx.execute(
            "INSERT INTO global_versions (skill_id, version, published_at, notes, published_from_workspace_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                manifest.skill_id.as_str(),
                manifest.version.as_str(),
                manifest.published_at.as_str(),
                manifest.notes.as_str(),
                manifest.published_from_workspace_id,
            ],
        )?;
        for variant in &manifest.variants {
            let payload_path = PathBuf::from("store")
                .join("skills")
                .join(&manifest.skill_id)
                .join(&manifest.version)
                .join(variant.provider.as_str())
                .join(&variant.display_name);
            tx.execute(
                "INSERT INTO version_variants (skill_id, version, provider, payload_path, display_name)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    manifest.skill_id.as_str(),
                    manifest.version.as_str(),
                    variant.provider.as_str(),
                    normalize_path(&payload_path),
                    variant.display_name.as_str(),
                ],
            )?;
        }
        tx.commit()?;

        for index in 0..archive.len() {
            let mut entry = archive.by_index(index)?;
            let name = entry.name().to_string();
            if name == "manifest.json" {
                continue;
            }
            let Some(relative) = name.strip_prefix("payload/") else {
                continue;
            };
            let out_path = self
                .store_dir
                .join(&manifest.skill_id)
                .join(&manifest.version)
                .join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&out_path)?;
                continue;
            }
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = File::create(&out_path)?;
            std::io::copy(&mut entry, &mut output)?;
        }

        self.append_activity(
            "import",
            format!("导入 {} {}", manifest.name, manifest.version),
            format!("从 {} 导入全局库", package_path.display()),
        )?;

        Ok(PackageOperationResponse {
            path: package_path.to_string_lossy().to_string(),
            message: "package imported".to_string(),
        })
    }

    fn write_bootstrap_config(&self, config: &BootstrapConfig) -> Result<()> {
        if let Some(parent) = self.bootstrap_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&self.bootstrap_path, serde_json::to_string_pretty(config)?)?;
        Ok(())
    }

    fn copy_library_data(&self, target_base_dir: &Path) -> Result<()> {
        fs::create_dir_all(target_base_dir)?;

        if self.db_path.exists() {
            let target_db = target_base_dir.join("library.db");
            if target_db.exists() {
                fs::remove_file(&target_db)?;
            }
            fs::copy(&self.db_path, &target_db)?;
        }

        let source_store_root = self.base_dir.join("store");
        if source_store_root.exists() {
            let target_store_root = target_base_dir.join("store");
            copy_directory(&source_store_root, &target_store_root)?;
        }

        Ok(())
    }

    fn init(&self) -> Result<()> {
        fs::create_dir_all(&self.base_dir)?;
        fs::create_dir_all(&self.store_dir)?;
        let conn = self.connection()?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS workspaces (
                workspace_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS global_skills (
                skill_id TEXT PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS global_versions (
                skill_id TEXT NOT NULL,
                version TEXT NOT NULL,
                published_at TEXT NOT NULL,
                notes TEXT NOT NULL,
                published_from_workspace_id TEXT,
                PRIMARY KEY (skill_id, version)
            );
            CREATE TABLE IF NOT EXISTS version_variants (
                skill_id TEXT NOT NULL,
                version TEXT NOT NULL,
                provider TEXT NOT NULL,
                payload_path TEXT NOT NULL,
                display_name TEXT NOT NULL,
                PRIMARY KEY (skill_id, version, provider)
            );
            CREATE TABLE IF NOT EXISTS activity_log (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            ",
        )?;
        Ok(())
    }

    fn connection(&self) -> Result<Connection> {
        Connection::open(&self.db_path).with_context(|| format!("failed to open {}", self.db_path.display()))
    }

    fn resolve_workspace_context(&self, workspace_root: &str) -> Result<WorkspaceFsContext> {
        if workspace_root == SPECIAL_WORKSPACE_ROOT {
            return Ok(WorkspaceFsContext::SpecialProviderGlobal);
        }

        let root_path = PathBuf::from(workspace_root);
        if !root_path.exists() {
            return Err(anyhow!("workspace does not exist: {workspace_root}"));
        }

        Ok(WorkspaceFsContext::Standard { root_path })
    }

    fn workspace_record_for_context(
        &self,
        context: &WorkspaceFsContext,
        name: Option<String>,
    ) -> Result<WorkspaceRecord> {
        match context {
            WorkspaceFsContext::Standard { root_path } => self.upsert_workspace(root_path, name),
            WorkspaceFsContext::SpecialProviderGlobal => Ok(self.special_workspace_record()),
        }
    }

    fn special_workspace_record(&self) -> WorkspaceRecord {
        WorkspaceRecord {
            workspace_id: SPECIAL_WORKSPACE_ID.to_string(),
            name: SPECIAL_WORKSPACE_NAME.to_string(),
            root_path: SPECIAL_WORKSPACE_ROOT.to_string(),
            created_at: SPECIAL_WORKSPACE_CREATED_AT.to_string(),
            kind: WorkspaceKind::Special,
            available_providers: self.special_available_providers(),
        }
    }

    fn special_available_providers(&self) -> Vec<Provider> {
        Provider::all()
            .into_iter()
            .filter(|provider| {
                self.special_provider_root(*provider)
                    .map(|root| root.exists())
                    .unwrap_or(false)
            })
            .collect()
    }

    fn special_provider_root(&self, provider: Provider) -> Option<PathBuf> {
        home_dir_for_special_workspace().map(|home| home.join(provider.special_global_relative_from_home()))
    }

    fn special_workspace_storage_root(&self) -> PathBuf {
        self.base_dir
            .join("special-workspaces")
            .join(SPECIAL_WORKSPACE_STORAGE_NAME)
    }

    fn indexes_dir_for_context(&self, context: &WorkspaceFsContext) -> PathBuf {
        match context {
            WorkspaceFsContext::Standard { root_path } => {
                root_path.join(".htyskillmanager").join("instances")
            }
            WorkspaceFsContext::SpecialProviderGlobal => self
                .special_workspace_storage_root()
                .join(".htyskillmanager")
                .join("instances"),
        }
    }

    fn scan_provider_root(&self, context: &WorkspaceFsContext, provider: Provider) -> Option<PathBuf> {
        match context {
            WorkspaceFsContext::Standard { root_path } => Some(root_path.join(provider.root_relative())),
            WorkspaceFsContext::SpecialProviderGlobal => self.special_provider_root(provider),
        }
    }

    fn relative_path_for_context(&self, context: &WorkspaceFsContext, path: &Path) -> Result<String> {
        match context {
            WorkspaceFsContext::Standard { root_path } => Ok(normalize_path(path.strip_prefix(root_path)?)),
            WorkspaceFsContext::SpecialProviderGlobal => Ok(normalize_path(path)),
        }
    }

    fn resolve_instance_source_dir(
        &self,
        context: &WorkspaceFsContext,
        index: &LocalIndexFile,
    ) -> Result<PathBuf> {
        match context {
            WorkspaceFsContext::Standard { root_path } => Ok(root_path.join(&index.relative_path)),
            WorkspaceFsContext::SpecialProviderGlobal => Ok(PathBuf::from(&index.relative_path)),
        }
    }

    fn display_index_path(&self, context: &WorkspaceFsContext, index_path: &Path) -> Result<String> {
        match context {
            WorkspaceFsContext::Standard { root_path } => Ok(normalize_path(index_path.strip_prefix(root_path)?)),
            WorkspaceFsContext::SpecialProviderGlobal => Ok(normalize_path(index_path)),
        }
    }

    fn install_provider_root(&self, context: &WorkspaceFsContext, provider: Provider) -> Result<PathBuf> {
        match context {
            WorkspaceFsContext::Standard { root_path } => Ok(root_path.join(provider.root_relative())),
            WorkspaceFsContext::SpecialProviderGlobal => {
                let root = self
                    .special_provider_root(provider)
                    .ok_or_else(|| anyhow!("无法解析 {} 的全局路径", provider.as_str()))?;
                if !root.exists() {
                    return Err(anyhow!(
                        "特殊工作区未发现 {} 的全局路径：{}",
                        provider.as_str(),
                        root.display()
                    ));
                }
                Ok(root)
            }
        }
    }

    fn backup_target_for_context(
        &self,
        context: &WorkspaceFsContext,
        target_dir: &Path,
        provider: Provider,
    ) -> Result<String> {
        match context {
            WorkspaceFsContext::Standard { root_path } => {
                let relative_path = normalize_path(target_dir.strip_prefix(root_path)?);
                self.backup_existing_target(root_path, &relative_path)
            }
            WorkspaceFsContext::SpecialProviderGlobal => {
                let backup_root = self
                    .special_workspace_storage_root()
                    .join(".htyskillmanager")
                    .join("backups")
                    .join(Utc::now().format("%Y%m%d%H%M%S").to_string())
                    .join(provider.as_str())
                    .join(
                        target_dir
                            .file_name()
                            .map(|value| value.to_string_lossy().to_string())
                            .unwrap_or_else(|| "skill".to_string()),
                    );
                copy_directory(target_dir, &backup_root)?;
                Ok(normalize_path(backup_root))
            }
        }
    }

    fn special_provider_from_target_path(&self, target: &Path) -> Option<Provider> {
        Provider::all().into_iter().find(|provider| {
            self.special_provider_root(*provider)
                .map(|root| normalize_path(target).starts_with(&normalize_path(root)))
                .unwrap_or(false)
        })
    }

    fn upsert_workspace(&self, root_path: &Path, name: Option<String>) -> Result<WorkspaceRecord> {
        let conn = self.connection()?;
        let existing = conn
            .query_row(
                "SELECT workspace_id, name, root_path, created_at FROM workspaces WHERE root_path = ?1",
                [root_path.to_string_lossy().as_ref()],
                |row| {
                    Ok(WorkspaceRecord {
                        workspace_id: row.get(0)?,
                        name: row.get(1)?,
                        root_path: row.get(2)?,
                        created_at: row.get(3)?,
                        kind: WorkspaceKind::Project,
                        available_providers: Provider::all(),
                    })
                },
            )
            .optional()?;
        if let Some(existing) = existing {
            return Ok(existing);
        }

        let workspace = WorkspaceRecord {
            workspace_id: uuid::Uuid::new_v4().to_string(),
            name: name.unwrap_or_else(|| {
                root_path
                    .file_name()
                    .map(|value| value.to_string_lossy().to_string())
                    .unwrap_or_else(|| root_path.to_string_lossy().to_string())
            }),
            root_path: root_path.to_string_lossy().to_string(),
            created_at: now_iso(),
            kind: WorkspaceKind::Project,
            available_providers: Provider::all(),
        };
        conn.execute(
            "INSERT INTO workspaces (workspace_id, name, root_path, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                workspace.workspace_id,
                workspace.name,
                workspace.root_path,
                workspace.created_at,
            ],
        )?;
        Ok(workspace)
    }

    fn ensure_version_exists(&self, skill_id: &str, version: &str) -> Result<()> {
        let conn = self.connection()?;
        let found = conn
            .query_row(
                "SELECT version FROM global_versions WHERE skill_id = ?1 AND version = ?2",
                params![skill_id, version],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if found.is_none() {
            return Err(anyhow!("version not found: {skill_id}@{version}"));
        }
        Ok(())
    }

    fn ensure_version_not_exists(&self, skill_id: &str, version: &str) -> Result<()> {
        let conn = self.connection()?;
        let found = conn
            .query_row(
                "SELECT version FROM global_versions WHERE skill_id = ?1 AND version = ?2",
                params![skill_id, version],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if found.is_some() {
            return Err(anyhow!("version already exists: {skill_id}@{version}"));
        }
        Ok(())
    }

    fn append_activity(&self, kind: &str, title: String, detail: String) -> Result<()> {
        let conn = self.connection()?;
        conn.execute(
            "INSERT INTO activity_log (id, kind, title, detail, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![uuid::Uuid::new_v4().to_string(), kind, title, detail, now_iso()],
        )?;
        Ok(())
    }

    fn unique_slug(&self, conn: &Connection, seed: &str) -> Result<String> {
        let base_slug = slugify(seed);
        let mut slug = base_slug.clone();
        let mut index = 1usize;
        loop {
            let exists = conn
                .query_row(
                    "SELECT slug FROM global_skills WHERE slug = ?1",
                    [slug.as_str()],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            if exists.is_none() {
                return Ok(slug);
            }
            index += 1;
            slug = format!("{}-{}", base_slug, index);
        }
    }

    fn load_version_variants(
        &self,
        conn: &Connection,
        skill_id: &str,
        version: &str,
    ) -> Result<Vec<ProviderVariantRecord>> {
        let mut stmt = conn.prepare(
            "SELECT provider, payload_path, display_name
             FROM version_variants
             WHERE skill_id = ?1 AND version = ?2
             ORDER BY provider ASC",
        )?;
        let mut rows = stmt.query(params![skill_id, version])?;
        let mut variants = Vec::new();
        while let Some(row) = rows.next()? {
            let provider_raw: String = row.get(0)?;
            variants.push(ProviderVariantRecord {
                provider: provider_from_string(&provider_raw)?,
                payload_path: row.get(1)?,
                display_name: row.get(2)?,
            });
        }
        Ok(variants)
    }

    fn load_index_map(&self, indexes_dir: &Path) -> Result<HashMap<String, (PathBuf, LocalIndexFile)>> {
        let mut indexes = HashMap::new();
        if !indexes_dir.exists() {
            return Ok(indexes);
        }
        for entry in fs::read_dir(indexes_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("htyVersion") {
                continue;
            }
            let content = fs::read_to_string(&path)?;
            let index: LocalIndexFile = serde_json::from_str(&content)?;
            indexes.insert(index_key(index.provider, &index.relative_path), (path, index));
        }
        Ok(indexes)
    }

    fn write_index_file(&self, path: &Path, index: &LocalIndexFile) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, serde_json::to_string_pretty(index)?)?;
        Ok(())
    }

    fn find_index_by_instance_id(&self, indexes_dir: &Path, instance_id: &str) -> Result<(PathBuf, LocalIndexFile)> {
        for entry in fs::read_dir(indexes_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("htyVersion") {
                continue;
            }
            let content = fs::read_to_string(&path)?;
            let index: LocalIndexFile = serde_json::from_str(&content)?;
            if index.instance_id == instance_id {
                return Ok((path, index));
            }
        }
        Err(anyhow!("instance not found: {instance_id}"))
    }

    fn backup_existing_target(&self, workspace_root: &Path, relative_path: &str) -> Result<String> {
        let source = workspace_root.join(relative_path);
        if !source.exists() {
            return Err(anyhow!("target does not exist: {}", source.display()));
        }
        let backup_relative = PathBuf::from(".htyskillmanager")
            .join("backups")
            .join(Utc::now().format("%Y%m%d%H%M%S").to_string())
            .join(relative_path);
        let target = workspace_root.join(&backup_relative);
        copy_directory(&source, &target)?;
        Ok(normalize_path(backup_relative))
    }
}

fn load_bootstrap_config(path: &Path) -> Result<BootstrapConfig> {
    if !path.exists() {
        return Ok(BootstrapConfig::default());
    }

    let content = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content).with_context(|| format!("failed to parse {}", path.display()))?)
}

fn paths_match(left: &Path, right: &Path) -> bool {
    normalize_path(left)
        .trim_end_matches('/')
        .eq_ignore_ascii_case(normalize_path(right).trim_end_matches('/'))
}

fn local_instance_from_index(
    workspace: &WorkspaceRecord,
    index_path: String,
    index: &LocalIndexFile,
) -> Result<LocalInstance> {
    Ok(LocalInstance {
        instance_id: index.instance_id.clone(),
        workspace_id: workspace.workspace_id.clone(),
        provider: index.provider,
        relative_path: index.relative_path.clone(),
        display_name: index.display_name.clone(),
        linked_skill_id: index.linked_skill_id.clone(),
        linked_version: index.linked_version.clone(),
        updated_at: index.updated_at.clone(),
        status: if index.linked_skill_id.is_some() {
            InstanceStatus::Bound
        } else {
            InstanceStatus::Unbound
        },
        index_path,
    })
}

fn normalize_publish_providers(input: Option<Vec<Provider>>) -> Vec<Provider> {
    let providers = input.unwrap_or_else(Provider::all);
    if providers.is_empty() {
        Provider::all()
    } else {
        providers
    }
}

fn provider_from_string(input: &str) -> Result<Provider> {
    match input {
        "codex" => Ok(Provider::Codex),
        "claude" => Ok(Provider::Claude),
        "cursor" => Ok(Provider::Cursor),
        _ => Err(anyhow!("unknown provider: {input}")),
    }
}

fn parse_tags(tags_json: &str) -> Vec<String> {
    serde_json::from_str(tags_json).unwrap_or_default()
}

fn normalize_path(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().replace('\\', "/")
}

fn home_dir_for_special_workspace() -> Option<PathBuf> {
    std::env::var_os("HTY_SPECIAL_HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn index_key(provider: Provider, relative_path: &str) -> String {
    format!("{}::{}", provider.as_str(), relative_path)
}

fn count_query(conn: &Connection, sql: &str) -> Result<usize> {
    Ok(conn.query_row(sql, [], |row| row.get::<_, usize>(0))?)
}

fn count_query_with_param(conn: &Connection, sql: &str, param: &str) -> Result<usize> {
    Ok(conn.query_row(sql, [param], |row| row.get::<_, usize>(0))?)
}

fn slugify(input: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for character in input.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }
    let normalized = slug.trim_matches('-').to_string();
    if normalized.is_empty() {
        "skill".to_string()
    } else {
        normalized
    }
}

fn bump_patch_version(version: &str) -> Result<String> {
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() != 3 {
        return Err(anyhow!("invalid semantic version: {version}"));
    }
    let major = parts[0].parse::<u64>()?;
    let minor = parts[1].parse::<u64>()?;
    let patch = parts[2].parse::<u64>()?;
    Ok(format!("{}.{}.{}", major, minor, patch + 1))
}

fn copy_directory(source: &Path, target: &Path) -> Result<()> {
    if target.exists() {
        fs::remove_dir_all(target)?;
    }
    for entry in WalkDir::new(source) {
        let entry = entry?;
        let relative = entry.path().strip_prefix(source)?;
        let destination = target.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&destination)?;
        } else {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), &destination)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{BindRequest, InstallRequest, PublishMode, PublishRequest, UpdateBoundInstanceRequest, UpdateLibraryRootRequest, WorkspaceKind};
    use std::sync::{Mutex, OnceLock};

    fn special_home_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("hty-skill-manager-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).expect("temp dir");
        path
    }

    fn prepare_workspace_skill(root: &Path, provider: Provider, skill_name: &str) {
        let skill_dir = root.join(provider.root_relative()).join(skill_name);
        fs::create_dir_all(&skill_dir).expect("skill dir");
        fs::write(skill_dir.join("README.md"), skill_name).expect("seed file");
    }

    fn prepare_workspace(root: &Path) {
        prepare_workspace_skill(root, Provider::Codex, "demo-skill");
    }

    fn prepare_special_provider_root(home: &Path, provider: Provider, skill_name: &str, content: &str) {
        let skill_dir = home
            .join(provider.special_global_relative_from_home())
            .join(skill_name);
        fs::create_dir_all(&skill_dir).expect("special provider root");
        fs::write(skill_dir.join("README.md"), content).expect("special seed file");
    }

    #[test]
    fn scan_workspace_creates_index_files() {
        let app_dir = temp_dir();
        let workspace_dir = temp_dir();
        prepare_workspace(&workspace_dir);
        let service = AppService::from_base_dir(app_dir).expect("service");

        let snapshot = service
            .scan_workspace(workspace_dir.to_str().unwrap(), Some("Workspace A".to_string()))
            .expect("scan");

        assert_eq!(snapshot.instances.len(), 1);
        let index_path = workspace_dir
            .join(".htyskillmanager")
            .join("instances")
            .join(format!("{}.htyVersion", snapshot.instances[0].instance_id));
        assert!(index_path.exists());
    }

    #[test]
    fn scan_workspace_ignores_hidden_skill_directories() {
        let app_dir = temp_dir();
        let workspace_dir = temp_dir();
        prepare_workspace(&workspace_dir);
        let hidden_skill_dir = workspace_dir.join(".codex").join("skills").join(".system");
        fs::create_dir_all(&hidden_skill_dir).expect("hidden skill dir");
        fs::write(hidden_skill_dir.join("README.md"), "hidden").expect("hidden seed file");
        let service = AppService::from_base_dir(app_dir).expect("service");

        let snapshot = service
            .scan_workspace(workspace_dir.to_str().unwrap(), Some("Workspace A".to_string()))
            .expect("scan");

        assert_eq!(snapshot.instances.len(), 1);
        assert_eq!(snapshot.instances[0].display_name, "demo-skill");
    }

    #[test]
    fn publish_defaults_to_all_providers() {
        let app_dir = temp_dir();
        let workspace_dir = temp_dir();
        prepare_workspace(&workspace_dir);
        let service = AppService::from_base_dir(app_dir.clone()).expect("service");
        let snapshot = service
            .scan_workspace(workspace_dir.to_str().unwrap(), Some("Workspace A".to_string()))
            .expect("scan");
        let instance = snapshot.instances.first().expect("instance");

        let published = service
            .publish_to_global(PublishRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: instance.instance_id.clone(),
                providers: None,
                skill_mode: PublishMode::Create,
                existing_skill_id: None,
                name: Some("Demo Skill".to_string()),
                slug: None,
                description: Some("Demo".to_string()),
                tags: Some(vec!["demo".to_string()]),
                notes: Some("initial".to_string()),
            })
            .expect("publish");

        assert_eq!(published.providers.len(), 3);
        assert!(app_dir
            .join("store")
            .join("skills")
            .join(&published.skill_id)
            .join("1.0.0")
            .join("codex")
            .exists());
    }

    #[test]
    fn install_selected_providers_creates_targets() {
        let app_dir = temp_dir();
        let source_workspace = temp_dir();
        let target_workspace = temp_dir();
        prepare_workspace(&source_workspace);
        let service = AppService::from_base_dir(app_dir).expect("service");
        let snapshot = service
            .scan_workspace(source_workspace.to_str().unwrap(), Some("Source".to_string()))
            .expect("scan");
        let instance = snapshot.instances.first().expect("instance");
        let published = service
            .publish_to_global(PublishRequest {
                workspace_root: source_workspace.to_str().unwrap().to_string(),
                instance_id: instance.instance_id.clone(),
                providers: None,
                skill_mode: PublishMode::Create,
                existing_skill_id: None,
                name: Some("Demo Skill".to_string()),
                slug: None,
                description: Some("Demo".to_string()),
                tags: Some(vec![]),
                notes: Some("initial".to_string()),
            })
            .expect("publish");

        let installed = service
            .install_from_global(InstallRequest {
                workspace_root: target_workspace.to_str().unwrap().to_string(),
                skill_id: published.skill_id,
                version: published.version,
                providers: Some(vec![Provider::Codex, Provider::Claude]),
            })
            .expect("install");

        assert_eq!(installed.installed_targets.len(), 2);
        assert!(target_workspace
            .join(".codex")
            .join("skills")
            .join("demo-skill")
            .exists());
        assert!(target_workspace
            .join(".claude")
            .join("skills")
            .join("demo-skill")
            .exists());
    }

    #[test]
    fn bind_local_instance_rejects_duplicate_global_version_in_same_workspace() {
        let app_dir = temp_dir();
        let workspace_dir = temp_dir();
        prepare_workspace(&workspace_dir);
        prepare_workspace_skill(&workspace_dir, Provider::Codex, "second-skill");
        let service = AppService::from_base_dir(app_dir).expect("service");
        let snapshot = service
            .scan_workspace(workspace_dir.to_str().unwrap(), Some("Workspace A".to_string()))
            .expect("scan");
        let first = snapshot
            .instances
            .iter()
            .find(|instance| instance.display_name == "demo-skill")
            .expect("first instance");
        let second = snapshot
            .instances
            .iter()
            .find(|instance| instance.display_name == "second-skill")
            .expect("second instance");

        let published = service
            .publish_to_global(PublishRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: first.instance_id.clone(),
                providers: None,
                skill_mode: PublishMode::Create,
                existing_skill_id: None,
                name: Some("Demo Skill".to_string()),
                slug: None,
                description: Some("Demo".to_string()),
                tags: Some(vec![]),
                notes: Some("initial".to_string()),
            })
            .expect("publish");

        let error = service
            .bind_local_instance(BindRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: second.instance_id.clone(),
                skill_id: published.skill_id,
                version: published.version,
            })
            .expect_err("duplicate bind should be rejected");

        assert!(error
            .to_string()
            .contains("同一个全局版本在当前工作区的同一 provider 下只能绑定一个本地实例"));
    }

    #[test]
    fn bind_local_instance_allows_same_global_version_for_different_providers() {
        let app_dir = temp_dir();
        let workspace_dir = temp_dir();
        prepare_workspace(&workspace_dir);
        prepare_workspace_skill(&workspace_dir, Provider::Claude, "claude-skill");
        let service = AppService::from_base_dir(app_dir).expect("service");
        let snapshot = service
            .scan_workspace(workspace_dir.to_str().unwrap(), Some("Workspace A".to_string()))
            .expect("scan");
        let codex_instance = snapshot
            .instances
            .iter()
            .find(|instance| instance.display_name == "demo-skill")
            .expect("codex instance");
        let claude_instance = snapshot
            .instances
            .iter()
            .find(|instance| instance.display_name == "claude-skill")
            .expect("claude instance");

        let published = service
            .publish_to_global(PublishRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: codex_instance.instance_id.clone(),
                providers: None,
                skill_mode: PublishMode::Create,
                existing_skill_id: None,
                name: Some("Demo Skill".to_string()),
                slug: None,
                description: Some("Demo".to_string()),
                tags: Some(vec![]),
                notes: Some("initial".to_string()),
            })
            .expect("publish");

        let bound = service
            .bind_local_instance(BindRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: claude_instance.instance_id.clone(),
                skill_id: published.skill_id,
                version: published.version,
            })
            .expect("different provider should be allowed");

        assert_eq!(bound.provider, Provider::Claude);
        assert_eq!(bound.linked_version.as_deref(), Some("1.0.0"));
    }

    #[test]
    fn update_bound_instance_refreshes_bound_provider_in_place() {
        let app_dir = temp_dir();
        let workspace_dir = temp_dir();
        prepare_workspace(&workspace_dir);
        prepare_workspace_skill(&workspace_dir, Provider::Claude, "custom-claude-name");
        let service = AppService::from_base_dir(app_dir).expect("service");
        let snapshot = service
            .scan_workspace(workspace_dir.to_str().unwrap(), Some("Workspace A".to_string()))
            .expect("scan");
        let codex_instance = snapshot
            .instances
            .iter()
            .find(|instance| instance.provider == Provider::Codex && instance.display_name == "demo-skill")
            .expect("codex instance");
        let claude_instance = snapshot
            .instances
            .iter()
            .find(|instance| instance.provider == Provider::Claude && instance.display_name == "custom-claude-name")
            .expect("claude instance");

        let published = service
            .publish_to_global(PublishRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: codex_instance.instance_id.clone(),
                providers: None,
                skill_mode: PublishMode::Create,
                existing_skill_id: None,
                name: Some("Demo Skill".to_string()),
                slug: None,
                description: Some("Demo".to_string()),
                tags: Some(vec![]),
                notes: Some("initial".to_string()),
            })
            .expect("publish");

        service
            .bind_local_instance(BindRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: claude_instance.instance_id.clone(),
                skill_id: published.skill_id.clone(),
                version: published.version.clone(),
            })
            .expect("bind");

        let claude_readme = workspace_dir
            .join(".claude")
            .join("skills")
            .join("custom-claude-name")
            .join("README.md");
        fs::write(&claude_readme, "local override").expect("overwrite local claude skill");

        let updated = service
            .update_bound_instance(UpdateBoundInstanceRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: claude_instance.instance_id.clone(),
            })
            .expect("update bound instance");

        assert_eq!(fs::read_to_string(&claude_readme).expect("read updated file"), "demo-skill");
        assert_eq!(updated.provider, Provider::Claude);
        assert_eq!(updated.display_name, "custom-claude-name");
        assert_eq!(updated.relative_path, ".claude/skills/custom-claude-name");
        assert_eq!(updated.linked_skill_id.as_deref(), Some(published.skill_id.as_str()));
        assert_eq!(updated.linked_version.as_deref(), Some("1.0.0"));
    }

    #[test]
    fn update_library_root_switches_to_custom_directory() {
        let default_app_dir = temp_dir();
        let custom_app_dir = temp_dir();
        let workspace_dir = temp_dir();
        prepare_workspace(&workspace_dir);
        let service = AppService::from_base_dir(default_app_dir.clone()).expect("service");
        let snapshot = service
            .scan_workspace(workspace_dir.to_str().unwrap(), Some("Workspace A".to_string()))
            .expect("scan");
        let instance = snapshot.instances.first().expect("instance");

        let published = service
            .publish_to_global(PublishRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: instance.instance_id.clone(),
                providers: None,
                skill_mode: PublishMode::Create,
                existing_skill_id: None,
                name: Some("Demo Skill".to_string()),
                slug: None,
                description: Some("Demo".to_string()),
                tags: Some(vec!["demo".to_string()]),
                notes: Some("initial".to_string()),
            })
            .expect("publish");

        let settings = service
            .update_library_root(UpdateLibraryRootRequest {
                library_root: Some(custom_app_dir.to_string_lossy().to_string()),
                move_existing: true,
            })
            .expect("update settings");

        assert_eq!(settings.library_root, custom_app_dir.to_string_lossy().to_string());
        assert!(settings.using_custom_library_root);
        assert!(custom_app_dir.join("library.db").exists());
        assert!(custom_app_dir
            .join("store")
            .join("skills")
            .join(&published.skill_id)
            .join("1.0.0")
            .exists());

        let reloaded = AppService::from_base_dir(default_app_dir).expect("reloaded service");
        let reloaded_settings = reloaded.get_app_settings().expect("settings");
        assert_eq!(reloaded_settings.library_root, custom_app_dir.to_string_lossy().to_string());
    }

    #[test]
    fn missing_custom_library_root_falls_back_to_default_directory() {
        let default_app_dir = temp_dir();
        let custom_app_dir = temp_dir();
        let workspace_dir = temp_dir();
        prepare_workspace(&workspace_dir);
        let service = AppService::from_base_dir(default_app_dir.clone()).expect("service");
        let snapshot = service
            .scan_workspace(workspace_dir.to_str().unwrap(), Some("Workspace A".to_string()))
            .expect("scan");
        let instance = snapshot.instances.first().expect("instance");

        service
            .publish_to_global(PublishRequest {
                workspace_root: workspace_dir.to_str().unwrap().to_string(),
                instance_id: instance.instance_id.clone(),
                providers: None,
                skill_mode: PublishMode::Create,
                existing_skill_id: None,
                name: Some("Demo Skill".to_string()),
                slug: None,
                description: Some("Demo".to_string()),
                tags: Some(vec!["demo".to_string()]),
                notes: Some("initial".to_string()),
            })
            .expect("publish");

        service
            .update_library_root(UpdateLibraryRootRequest {
                library_root: Some(custom_app_dir.to_string_lossy().to_string()),
                move_existing: true,
            })
            .expect("update settings");

        fs::remove_dir_all(&custom_app_dir).expect("remove missing custom root");

        let reloaded = AppService::from_base_dir(default_app_dir.clone()).expect("reloaded service");
        let reloaded_settings = reloaded.get_app_settings().expect("settings");
        assert_eq!(
            reloaded_settings.library_root,
            default_app_dir.to_string_lossy().to_string()
        );
        assert!(!reloaded_settings.using_custom_library_root);

        let reloaded_again = AppService::from_base_dir(default_app_dir.clone()).expect("reloaded again");
        let settings_again = reloaded_again.get_app_settings().expect("settings again");
        assert_eq!(
            settings_again.library_root,
            default_app_dir.to_string_lossy().to_string()
        );
        assert!(!settings_again.using_custom_library_root);
        assert!(default_app_dir.join("library.db").exists());
    }

    #[test]
    fn scan_special_workspace_reads_existing_provider_roots() {
        let _guard = special_home_lock().lock().expect("special home lock");
        let app_dir = temp_dir();
        let special_home = temp_dir();
        prepare_special_provider_root(&special_home, Provider::Codex, "global-codex", "codex");
        prepare_special_provider_root(&special_home, Provider::Cursor, "global-cursor", "cursor");
        std::env::set_var("HTY_SPECIAL_HOME", &special_home);

        let service = AppService::from_base_dir(app_dir.clone()).expect("service");
        let snapshot = service
            .scan_workspace(SPECIAL_WORKSPACE_ROOT, None)
            .expect("scan special workspace");

        assert_eq!(snapshot.workspace.kind, WorkspaceKind::Special);
        assert_eq!(snapshot.workspace.available_providers, vec![Provider::Codex, Provider::Cursor]);
        assert_eq!(snapshot.instances.len(), 2);
        assert!(snapshot
            .instances
            .iter()
            .all(|instance| instance.relative_path.starts_with(&special_home.to_string_lossy().replace('\\', "/"))));
        assert!(app_dir
            .join("special-workspaces")
            .join("provider-global")
            .join(".htyskillmanager")
            .join("instances")
            .exists());

        std::env::remove_var("HTY_SPECIAL_HOME");
    }

    #[test]
    fn install_to_special_workspace_rejects_missing_provider_paths() {
        let _guard = special_home_lock().lock().expect("special home lock");
        let app_dir = temp_dir();
        let source_workspace = temp_dir();
        let special_home = temp_dir();
        prepare_workspace(&source_workspace);
        prepare_special_provider_root(&special_home, Provider::Codex, "existing-global-skill", "seed");
        std::env::set_var("HTY_SPECIAL_HOME", &special_home);

        let service = AppService::from_base_dir(app_dir).expect("service");
        let snapshot = service
            .scan_workspace(source_workspace.to_str().unwrap(), Some("Source".to_string()))
            .expect("scan");
        let instance = snapshot.instances.first().expect("instance");
        let published = service
            .publish_to_global(PublishRequest {
                workspace_root: source_workspace.to_str().unwrap().to_string(),
                instance_id: instance.instance_id.clone(),
                providers: None,
                skill_mode: PublishMode::Create,
                existing_skill_id: None,
                name: Some("Demo Skill".to_string()),
                slug: None,
                description: Some("Demo".to_string()),
                tags: Some(vec![]),
                notes: Some("initial".to_string()),
            })
            .expect("publish");

        let installed = service
            .install_from_global(InstallRequest {
                workspace_root: SPECIAL_WORKSPACE_ROOT.to_string(),
                skill_id: published.skill_id.clone(),
                version: published.version.clone(),
                providers: Some(vec![Provider::Codex]),
            })
            .expect("install to special workspace");

        assert_eq!(installed.installed_targets.len(), 1);
        assert!(special_home.join(".codex").join("skills").join("demo-skill").exists());

        let error = service
            .install_from_global(InstallRequest {
                workspace_root: SPECIAL_WORKSPACE_ROOT.to_string(),
                skill_id: published.skill_id,
                version: published.version,
                providers: Some(vec![Provider::Claude]),
            })
            .expect_err("missing claude root should be rejected");
        assert!(error
            .to_string()
            .contains("特殊工作区未发现 claude 对应的全局路径"));

        std::env::remove_var("HTY_SPECIAL_HOME");
    }
}



