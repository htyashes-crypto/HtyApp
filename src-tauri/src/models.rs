use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Codex,
    Claude,
    Cursor,
}

impl Provider {
    pub fn all() -> Vec<Self> {
        vec![Self::Codex, Self::Claude, Self::Cursor]
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::Cursor => "cursor",
        }
    }

    pub fn root_relative(&self) -> &'static str {
        match self {
            Self::Codex => ".codex/skills",
            Self::Claude => ".claude/skills",
            Self::Cursor => ".cursor/skills",
        }
    }

    pub fn special_global_relative_from_home(&self) -> &'static str {
        match self {
            Self::Codex => ".codex/skills",
            Self::Claude => ".claude/skills",
            Self::Cursor => ".cursor/skills-cursor",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceKind {
    Project,
    Special,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InstanceStatus {
    Bound,
    Unbound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    pub workspace_id: String,
    pub name: String,
    pub root_path: String,
    pub created_at: String,
    pub kind: WorkspaceKind,
    pub available_providers: Vec<Provider>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalIndexFile {
    pub schema_version: u32,
    pub instance_id: String,
    pub workspace_root: String,
    pub provider: Provider,
    pub relative_path: String,
    pub linked_skill_id: Option<String>,
    pub linked_version: Option<String>,
    pub display_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalInstance {
    pub instance_id: String,
    pub workspace_id: String,
    pub provider: Provider,
    pub relative_path: String,
    pub display_name: String,
    pub linked_skill_id: Option<String>,
    pub linked_version: Option<String>,
    pub updated_at: String,
    pub status: InstanceStatus,
    pub index_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub workspace: WorkspaceRecord,
    pub instances: Vec<LocalInstance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSkillSummary {
    pub skill_id: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub latest_version: Option<String>,
    pub latest_providers: Vec<Provider>,
    pub version_count: usize,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderVariantRecord {
    pub provider: Provider,
    pub payload_path: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalVersionRecord {
    pub skill_id: String,
    pub version: String,
    pub published_at: String,
    pub notes: String,
    pub published_from_workspace_id: Option<String>,
    pub providers: Vec<ProviderVariantRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSkillDetail {
    pub skill: GlobalSkillSummary,
    pub versions: Vec<GlobalVersionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityRecord {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub global_skill_count: usize,
    pub version_count: usize,
    pub workspace_count: usize,
    pub local_instance_count: usize,
    pub unbound_instance_count: usize,
    pub recent_activities: Vec<ActivityRecord>,
    pub library_root: String,
    pub store_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub default_library_root: String,
    pub library_root: String,
    pub store_root: String,
    pub using_custom_library_root: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLibraryRootRequest {
    pub library_root: Option<String>,
    pub move_existing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PublishMode {
    Create,
    Append,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishRequest {
    pub workspace_root: String,
    pub instance_id: String,
    pub providers: Option<Vec<Provider>>,
    pub skill_mode: PublishMode,
    pub existing_skill_id: Option<String>,
    pub name: Option<String>,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResponse {
    pub skill_id: String,
    pub version: String,
    pub providers: Vec<Provider>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRequest {
    pub workspace_root: String,
    pub skill_id: String,
    pub version: String,
    pub providers: Option<Vec<Provider>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledTarget {
    pub provider: Provider,
    pub target_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResponse {
    pub workspace_id: String,
    pub workspace_root: String,
    pub version: String,
    pub installed_targets: Vec<InstalledTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindRequest {
    pub workspace_root: String,
    pub instance_id: String,
    pub skill_id: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBoundInstanceRequest {
    pub workspace_root: String,
    pub instance_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPackageRequest {
    pub skill_id: String,
    pub version: String,
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPackageRequest {
    pub package_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageOperationResponse {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageManifest {
    pub schema_version: u32,
    pub exported_at: String,
    pub skill_id: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub version: String,
    pub published_at: String,
    pub notes: String,
    pub published_from_workspace_id: Option<String>,
    pub variants: Vec<ProviderVariantRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeepseekConfig {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_deepseek_base_url")]
    pub base_url: String,
    #[serde(default = "default_deepseek_model")]
    pub model: String,
    #[serde(default = "default_deepseek_opus")]
    pub opus_model: String,
    #[serde(default = "default_deepseek_sonnet")]
    pub sonnet_model: String,
    #[serde(default = "default_deepseek_haiku")]
    pub haiku_model: String,
    #[serde(default = "default_deepseek_subagent")]
    pub subagent_model: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub previous_env: HashMap<String, String>,
}

fn default_deepseek_base_url() -> String { "https://api.deepseek.com/anthropic".into() }
fn default_deepseek_model() -> String { "deepseek-v4-pro[1m]".into() }
fn default_deepseek_opus() -> String { "deepseek-v4-pro".into() }
fn default_deepseek_sonnet() -> String { "deepseek-v4-pro".into() }
fn default_deepseek_haiku() -> String { "deepseek-v4-flash".into() }
fn default_deepseek_subagent() -> String { "deepseek-v4-pro".into() }
