import {
  ALL_PROVIDERS,
  type ActivityRecord,
  type AppSettings,
  type BindRequest,
  type DashboardSummary,
  type ExportPackageRequest,
  type GlobalSkillDetail,
  type GlobalSkillSummary,
  type ImportPackageRequest,
  type InstallRequest,
  type InstallResponse,
  type LocalInstance,
  type MarketDownloadRequest,
  type MarketUploadRequest,
  type MarketRegistry,
  type PackageOperationResponse,
  type Provider,
  type PublishRequest,
  type PublishResponse,
  type UpdateBoundInstanceRequest,
  type UpdateLibraryRootRequest,
  type WorkspaceRecord,
  type WorkspaceSnapshot
} from "./types";

const SPECIAL_WORKSPACE_ROOT = "hty://workspace/provider-global";
const SPECIAL_WORKSPACE_ID = "workspace_special_provider_global";

interface MockState {
  settings: AppSettings;
  workspaces: WorkspaceRecord[];
  snapshots: Record<string, WorkspaceSnapshot>;
  skills: GlobalSkillDetail[];
  activities: ActivityRecord[];
}

interface MockMergeSessionState {
  summary: any;
  fileDetails: Record<string, any>;
}

let sequence = 200;
const mergeSessions: Record<string, MockMergeSessionState> = {};

function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}_${sequence}`;
}

function now() {
  return new Date().toISOString();
}

function rootRelative(provider: Provider) {
  switch (provider) {
    case "codex":
      return ".codex/skills";
    case "claude":
      return ".claude/skills";
    case "cursor":
      return ".cursor/skills";
  }
}

function specialProviderRoot(provider: Provider) {
  switch (provider) {
    case "codex":
      return "C:/Users/admin/.codex/skills";
    case "claude":
      return "C:/Users/admin/.claude/skills";
    case "cursor":
      return "C:/Users/admin/.cursor/skills-cursor";
  }
}

function bumpPatch(version: string) {
  const [major, minor, patch] = version.split(".").map((value) => Number(value));
  return `${major}.${minor}.${patch + 1}`;
}

function createInstance(
  workspace: WorkspaceRecord,
  provider: Provider,
  displayName: string,
  linkedSkillId: string | null,
  linkedVersion: string | null,
  pathMode: "project" | "special" = "project"
): LocalInstance & { appliedSkillId: string | null; appliedVersion: string | null } {
  const instanceId = nextId("instance");
  return {
    instanceId,
    workspaceId: workspace.workspaceId,
    provider,
    displayName,
    relativePath:
      pathMode === "special"
        ? `${specialProviderRoot(provider)}/${displayName}`
        : `${rootRelative(provider)}/${displayName}`,
    linkedSkillId,
    linkedVersion,
    appliedSkillId: linkedSkillId,
    appliedVersion: linkedVersion,
    status: linkedSkillId ? "bound" : "unbound",
    indexPath:
      pathMode === "special"
        ? `C:/Users/admin/AppData/Roaming/com.hty.skillmanager/special-workspaces/provider-global/.htyskillmanager/instances/${instanceId}.htyVersion`
        : `.htyskillmanager/instances/${instanceId}.htyVersion`
  };
}

function summaryFromDetail(detail: GlobalSkillDetail): GlobalSkillSummary {
  const latest = detail.versions[0] ?? null;
  return {
    ...detail.skill,
    latestVersion: latest?.version ?? null,
    latestProviders: latest?.providers.map((entry) => entry.provider) ?? [],
    versionCount: detail.versions.length
  };
}

function createInitialState(): MockState {
  const specialWorkspace: WorkspaceRecord = {
    workspaceId: SPECIAL_WORKSPACE_ID,
    name: "特殊工作区",
    rootPath: SPECIAL_WORKSPACE_ROOT,
    createdAt: "1970-01-01T00:00:00Z",
    kind: "special",
    availableProviders: ["codex", "claude"]
  };

  const workspaceA: WorkspaceRecord = {
    workspaceId: "workspace_a",
    name: "A 项目工作区",
    rootPath: "E:/Projects/AProject",
    createdAt: now(),
    kind: "project",
    availableProviders: [...ALL_PROVIDERS]
  };

  const workspaceB: WorkspaceRecord = {
    workspaceId: "workspace_b",
    name: "B 项目工作区",
    rootPath: "E:/Projects/BProject",
    createdAt: now(),
    kind: "project",
    availableProviders: [...ALL_PROVIDERS]
  };

  const teamReview: GlobalSkillDetail = {
    skill: {
      skillId: "skill_001",
      slug: "team-review-guard",
      name: "team-review-guard",
      description: "统一多项目的代码审查规范与输出风格。",
      tags: ["review", "team"],
      latestVersion: "1.0.8",
      latestProviders: ["codex", "claude", "cursor"],
      versionCount: 2,
      createdAt: now()
    },
    versions: [
      {
        skillId: "skill_001",
        version: "1.0.8",
        publishedAt: now(),
        notes: "补充 Cursor 目录同步。",
        publishedFromWorkspaceId: workspaceA.workspaceId,
        providers: ALL_PROVIDERS.map((provider) => ({
          provider,
          displayName: "team-review-guard",
          payloadPath: `store/skills/skill_001/1.0.8/${provider}/team-review-guard`
        }))
      },
      {
        skillId: "skill_001",
        version: "1.0.7",
        publishedAt: now(),
        notes: "历史版本快照。",
        publishedFromWorkspaceId: workspaceA.workspaceId,
        providers: (["codex", "claude"] as Provider[]).map((provider) => ({
          provider,
          displayName: "team-review-guard",
          payloadPath: `store/skills/skill_001/1.0.7/${provider}/team-review-guard`
        }))
      }
    ]
  };

  const starterPack: GlobalSkillDetail = {
    skill: {
      skillId: "skill_002",
      slug: "unity-editor-starter",
      name: "unity-editor-starter",
      description: "初始化 Unity 项目上下文的启动模板。",
      tags: ["starter", "unity"],
      latestVersion: "1.0.3",
      latestProviders: ["codex", "claude"],
      versionCount: 1,
      createdAt: now()
    },
    versions: [
      {
        skillId: "skill_002",
        version: "1.0.3",
        publishedAt: now(),
        notes: "整理上下文加载说明。",
        publishedFromWorkspaceId: workspaceA.workspaceId,
        providers: (["codex", "claude"] as Provider[]).map((provider) => ({
          provider,
          displayName: "unity-editor-starter",
          payloadPath: `store/skills/skill_002/1.0.3/${provider}/unity-editor-starter`
        }))
      }
    ]
  };

  const snapshots: Record<string, WorkspaceSnapshot> = {
    [specialWorkspace.rootPath]: {
      workspace: specialWorkspace,
      instances: [
        createInstance(specialWorkspace, "codex", "team-review-guard", "skill_001", "1.0.8", "special"),
        createInstance(specialWorkspace, "claude", "unity-editor-starter", "skill_002", "1.0.3", "special")
      ]
    },
    [workspaceA.rootPath]: {
      workspace: workspaceA,
      instances: [
        createInstance(workspaceA, "codex", "team-review-guard", "skill_001", "1.0.8"),
        createInstance(workspaceA, "claude", "unity-editor-starter", "skill_002", "1.0.3"),
        createInstance(workspaceA, "cursor", "project-style-guide", null, null)
      ]
    },
    [workspaceB.rootPath]: {
      workspace: workspaceB,
      instances: [
        createInstance(workspaceB, "codex", "workflow-release-checklist", null, null),
        createInstance(workspaceB, "cursor", "team-review-guard", "skill_001", "1.0.8")
      ]
    }
  };

  return {
    settings: {
      defaultLibraryRoot: "C:/Users/admin/AppData/Roaming/com.hty.skillmanager",
      libraryRoot: "C:/Users/admin/AppData/Roaming/com.hty.skillmanager",
      storeRoot: "C:/Users/admin/AppData/Roaming/com.hty.skillmanager/store/skills",
      usingCustomLibraryRoot: false
    },
    workspaces: [specialWorkspace, workspaceA, workspaceB],
    snapshots,
    skills: [teamReview, starterPack],
    activities: [
      {
        id: nextId("activity"),
        kind: "publish",
        title: "发布 team-review-guard v1.0.8",
        detail: "从 A 项目工作区上传并补全三个 provider。",
        createdAt: now()
      },
      {
        id: nextId("activity"),
        kind: "install",
        title: "安装 team-review-guard v1.0.8",
        detail: "已安装到特殊工作区的 Codex 与 Claude 目录。",
        createdAt: now()
      }
    ]
  };
}

const state = createInitialState();

function addActivity(kind: string, title: string, detail: string) {
  state.activities.unshift({
    id: nextId("activity"),
    kind,
    title,
    detail,
    createdAt: now()
  });
  state.activities = state.activities.slice(0, 30);
}

function createMockMergeSession(operation: "publish_append" | "update", displayName: string, needsResolution: boolean) {
  const sessionId = nextId("merge_session");
  const files = needsResolution
    ? [
        {
          relativePath: "SKILL.md",
          kind: "text",
          status: "conflict",
          resolution: null,
          summary: "文本冲突，需要手动处理。"
        },
        {
          relativePath: "references/guide.md",
          kind: "text",
          status: "auto",
          resolution: "manual",
          summary: "已自动合并非重叠文本修改。"
        }
      ]
    : [
        {
          relativePath: "SKILL.md",
          kind: "text",
          status: "auto",
          resolution: "manual",
          summary: "已自动合并非重叠文本修改。"
        }
      ];

  const summary = {
    sessionId,
    operation,
    action: needsResolution ? "needs_resolution" : "ready",
    state: needsResolution ? "needs_resolution" : "ready",
    title: operation === "update" ? `更新 ${displayName}` : `追加上传 ${displayName}`,
    description: needsResolution ? "检测到冲突，需要手动处理。" : "已完成自动分析，可以直接提交。",
    displayName,
    sourceLabel: "本地实例",
    targetLabel: operation === "update" ? "目标版本" : "目标 Skill 最新版本",
    cleanCount: 0,
    autoCount: files.filter((file) => file.status === "auto").length,
    conflictCount: files.filter((file) => file.status === "conflict").length,
    resolvedCount: 0,
    totalCount: files.length,
    files
  };

  const fileDetails = Object.fromEntries(
    files.map((file) => [
      file.relativePath,
      {
        sessionId,
        operation,
        title: summary.title,
        description: summary.description,
        displayName,
        relativePath: file.relativePath,
        kind: file.kind,
        status: file.status,
        resolution: file.resolution,
        summary: file.summary,
        base: { exists: true, isBinary: false, text: "base content" },
        local: { exists: true, isBinary: false, text: "local content" },
        target: { exists: true, isBinary: false, text: "target content" },
        result: { exists: true, isBinary: false, text: file.status === "conflict" ? "local content" : "merged content" }
      }
    ])
  );

  mergeSessions[sessionId] = { summary, fileDetails };
  return summary;
}

export const mockApi: any = {
  async getDashboard(): Promise<DashboardSummary> {
    const localInstanceCount = Object.values(state.snapshots).reduce(
      (total, snapshot) => total + snapshot.instances.length,
      0
    );
    const unboundInstanceCount = Object.values(state.snapshots).reduce(
      (total, snapshot) => total + snapshot.instances.filter((item) => item.status === "unbound").length,
      0
    );

    return {
      globalSkillCount: state.skills.length,
      versionCount: state.skills.reduce((total, detail) => total + detail.versions.length, 0),
      workspaceCount: state.workspaces.length,
      localInstanceCount,
      unboundInstanceCount,
      outdatedInstances: [],
      recentActivities: state.activities.slice(0, 8),
      libraryRoot: state.settings.libraryRoot,
      storeRoot: state.settings.storeRoot
    };
  },

  async getAppSettings(): Promise<AppSettings> {
    return state.settings;
  },

  async updateLibraryRoot(request: UpdateLibraryRootRequest): Promise<AppSettings> {
    const nextRoot = request.libraryRoot?.trim() || state.settings.defaultLibraryRoot;
    state.settings = {
      defaultLibraryRoot: state.settings.defaultLibraryRoot,
      libraryRoot: nextRoot,
      storeRoot: `${nextRoot}/store/skills`,
      usingCustomLibraryRoot: nextRoot !== state.settings.defaultLibraryRoot
    };
    addActivity("settings", "更新全局库路径", `${request.moveExisting ? "迁移并切换" : "切换到"} ${nextRoot}`);
    return state.settings;
  },

  async rebuildLibraryFromStore(): Promise<number> {
    return 0;
  },

  async listLibrary(): Promise<GlobalSkillSummary[]> {
    return state.skills.map(summaryFromDetail);
  },

  async getSkillDetail(skillId: string): Promise<GlobalSkillDetail> {
    const detail = state.skills.find((item) => item.skill.skillId === skillId);
    if (!detail) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    detail.skill = summaryFromDetail(detail);
    return detail;
  },

  async listWorkspaces(): Promise<WorkspaceRecord[]> {
    return state.workspaces;
  },

  async scanWorkspace(workspaceRoot: string, workspaceName?: string): Promise<WorkspaceSnapshot> {
    const existing = state.snapshots[workspaceRoot];
    if (existing) {
      return existing;
    }

    const workspace: WorkspaceRecord = {
      workspaceId: nextId("workspace"),
      name: workspaceName || workspaceRoot.split(/[\\/]/).filter(Boolean).pop() || workspaceRoot,
      rootPath: workspaceRoot,
      createdAt: now(),
      kind: "project",
      availableProviders: [...ALL_PROVIDERS]
    };
    const snapshot: WorkspaceSnapshot = { workspace, instances: [] };
    state.workspaces.push(workspace);
    state.snapshots[workspaceRoot] = snapshot;
    addActivity("scan", `扫描 ${workspace.name}`, "已接入新的工作区。");
    return snapshot;
  },

  async watchWorkspace(workspaceRoot: string, workspaceName?: string): Promise<WorkspaceSnapshot> {
    return this.scanWorkspace(workspaceRoot, workspaceName);
  },

  async publishToGlobal(request: PublishRequest): Promise<PublishResponse> {
    const snapshot = state.snapshots[request.workspaceRoot];
    const instance = snapshot?.instances.find((item) => item.instanceId === request.instanceId) as any;
    if (!snapshot || !instance) {
      throw new Error("Instance not found");
    }

    const providers = request.providers?.length ? request.providers : [...ALL_PROVIDERS];
    let detail = request.skillMode === "append"
      ? state.skills.find((item) => item.skill.skillId === request.existingSkillId)
      : undefined;

    if (!detail) {
      detail = {
        skill: {
          skillId: nextId("skill"),
          slug: request.slug || request.name || instance.displayName,
          name: request.name || instance.displayName,
          description: request.description || "",
          tags: request.tags || [],
          latestVersion: null,
          latestProviders: [],
          versionCount: 0,
          createdAt: now()
        },
        versions: []
      };
      state.skills.unshift(detail);
    }

    const version = detail.versions[0]?.version ? bumpPatch(detail.versions[0].version) : "1.0.0";
    detail.versions.unshift({
      skillId: detail.skill.skillId,
      version,
      publishedAt: now(),
      notes: request.notes || "",
      publishedFromWorkspaceId: snapshot.workspace.workspaceId,
      providers: providers.map((provider) => ({
        provider,
        displayName: instance.displayName,
        payloadPath: `store/skills/${detail!.skill.skillId}/${version}/${provider}/${instance.displayName}`
      }))
    });
    detail.skill = summaryFromDetail(detail);

    instance.linkedSkillId = detail.skill.skillId;
    instance.linkedVersion = version;
    instance.appliedSkillId = detail.skill.skillId;
    instance.appliedVersion = version;
    instance.status = "bound";

    addActivity("publish", `发布 ${detail.skill.name} ${version}`, `从 ${snapshot.workspace.name} 上传并生成 ${providers.length} 个 provider 变体。`);

    return {
      skillId: detail.skill.skillId,
      version,
      providers
    };
  },

  async prepareAppendPublishMerge(request: PublishRequest) {
    const snapshot = state.snapshots[request.workspaceRoot];
    const instance = snapshot?.instances.find((item) => item.instanceId === request.instanceId) as any;
    if (!snapshot || !instance || !request.existingSkillId) {
      throw new Error("Instance not found");
    }

    const needsResolution = !(instance.linkedSkillId === request.existingSkillId && instance.appliedVersion);
    return createMockMergeSession("publish_append", instance.displayName, needsResolution);
  },

  async prepareUpdateMerge(request: UpdateBoundInstanceRequest) {
    const snapshot = state.snapshots[request.workspaceRoot];
    const instance = snapshot?.instances.find((item) => item.instanceId === request.instanceId) as any;
    if (!snapshot || !instance) {
      throw new Error("Instance not found");
    }

    if (instance.linkedSkillId === instance.appliedSkillId && instance.linkedVersion === instance.appliedVersion) {
      return {
        action: "noop",
        operation: "update",
        message: "当前目标版本与已应用版本一致，没有可更新内容。"
      };
    }

    return createMockMergeSession("update", instance.displayName, false);
  },

  async getMergeSession(sessionId: string) {
    const session = mergeSessions[sessionId];
    if (!session) {
      throw new Error(`merge session not found: ${sessionId}`);
    }
    return session.summary;
  },

  async getMergeSessionFile(sessionId: string, relativePath: string) {
    const session = mergeSessions[sessionId];
    const detail = session?.fileDetails[relativePath];
    if (!detail) {
      throw new Error(`merge session file not found: ${relativePath}`);
    }
    return detail;
  },

  async resolveMergeSessionFile(request: { sessionId: string; relativePath: string; resolution: "local" | "target" | "manual"; content?: string }) {
    const session = mergeSessions[request.sessionId];
    const detail = session?.fileDetails[request.relativePath];
    if (!session || !detail) {
      throw new Error(`merge session file not found: ${request.relativePath}`);
    }

    detail.status = "resolved";
    detail.resolution = request.resolution;
    detail.summary = request.resolution === "manual" ? "已手工编辑冲突结果。" : request.resolution === "local" ? "已选择保留本地版本。" : "已选择采用目标版本。";
    detail.result.text = request.resolution === "target" ? detail.target.text : request.resolution === "local" ? detail.local.text : request.content ?? detail.result.text;

    const files = session.summary.files.map((file: any) => file.relativePath === request.relativePath
      ? { ...file, status: "resolved", resolution: request.resolution, summary: detail.summary }
      : file);
    session.summary = {
      ...session.summary,
      action: "ready",
      state: "ready",
      conflictCount: 0,
      resolvedCount: files.filter((file: any) => file.status === "resolved").length,
      files
    };
    return session.summary;
  },

  async commitMergeSession(request: { sessionId: string }) {
    const session = mergeSessions[request.sessionId];
    if (!session) {
      throw new Error(`merge session not found: ${request.sessionId}`);
    }

    delete mergeSessions[request.sessionId];
    if (session.summary.operation === "update") {
      return {
        sessionId: request.sessionId,
        operation: "update",
        message: "已应用合并结果并更新本地实例。"
      };
    }

    return {
      sessionId: request.sessionId,
      operation: "publish_append",
      skillId: "skill_001",
      version: "1.0.9",
      providers: ["codex", "claude", "cursor"],
      message: "已发布合并结果并同步本地实例。"
    };
  },

  async discardMergeSession(sessionId: string) {
    delete mergeSessions[sessionId];
    return {
      sessionId,
      message: "merge session discarded"
    };
  },

  async installFromGlobal(request: InstallRequest): Promise<InstallResponse> {
    const snapshot = state.snapshots[request.workspaceRoot];
    if (!snapshot) {
      throw new Error("Workspace not found");
    }
    const detail = state.skills.find((item) => item.skill.skillId === request.skillId);
    const version = detail?.versions.find((item) => item.version === request.version);
    if (!detail || !version) {
      throw new Error("Version not found");
    }
    const providers = request.providers?.length
      ? request.providers
      : version.providers.map((item) => item.provider);

    const installedTargets = providers.map((provider) => {
      const variant = version.providers.find((item) => item.provider === provider);
      if (!variant) {
        throw new Error(`Provider variant missing: ${provider}`);
      }
      if (snapshot.workspace.kind === "special" && !snapshot.workspace.availableProviders.includes(provider)) {
        throw new Error(`特殊工作区未发现 ${provider} 对应的全局路径`);
      }

      const existing = snapshot.instances.find(
        (item) => item.provider === provider && item.displayName === variant.displayName
      ) as any;
      if (existing) {
        existing.linkedSkillId = detail.skill.skillId;
        existing.linkedVersion = version.version;
        existing.appliedSkillId = detail.skill.skillId;
        existing.appliedVersion = version.version;
        existing.status = "bound";
      } else {
        snapshot.instances.unshift(
          createInstance(
            snapshot.workspace,
            provider,
            variant.displayName,
            detail.skill.skillId,
            version.version,
            snapshot.workspace.kind === "special" ? "special" : "project"
          )
        );
      }
      return {
        provider,
        targetPath:
          snapshot.workspace.kind === "special"
            ? `${specialProviderRoot(provider)}/${variant.displayName}`
            : `${rootRelative(provider)}/${variant.displayName}`
      };
    });

    addActivity("install", `安装 ${detail.skill.name} ${version.version}`, `已安装到 ${snapshot.workspace.name} 的 ${installedTargets.length} 个 provider 目录。`);

    return {
      workspaceId: snapshot.workspace.workspaceId,
      workspaceRoot: snapshot.workspace.rootPath,
      version: version.version,
      installedTargets
    };
  },

  async bindLocalInstance(request: BindRequest): Promise<LocalInstance> {
    const snapshot = state.snapshots[request.workspaceRoot];
    const instance = snapshot?.instances.find((item) => item.instanceId === request.instanceId) as any;
    if (!snapshot || !instance) {
      throw new Error("Instance not found");
    }
    const duplicate = snapshot.instances.find(
      (item) =>
        item.instanceId !== request.instanceId &&
        item.provider === instance.provider &&
        item.linkedSkillId === request.skillId
    );
    if (duplicate) {
      throw new Error("同一个全局 Skill 在当前工作区的同一 provider 下只能绑定一个本地实例。");
    }
    instance.linkedSkillId = request.skillId;
    instance.linkedVersion = null;
    instance.status = "bound";
    addActivity("bind", `绑定 ${instance.displayName}`, `绑定到 ${request.skillId}`);
    return instance;
  },

  async updateBoundInstance(request: UpdateBoundInstanceRequest): Promise<LocalInstance> {
    const snapshot = state.snapshots[request.workspaceRoot];
    const instance = snapshot?.instances.find((item) => item.instanceId === request.instanceId) as any;
    if (!snapshot || !instance) {
      throw new Error("Instance not found");
    }
    if (!instance.linkedSkillId || !instance.linkedVersion) {
      throw new Error("只能更新已绑定实例。");
    }

    instance.appliedSkillId = instance.linkedSkillId;
    instance.appliedVersion = instance.linkedVersion;
    instance.status = "bound";
    addActivity("update", `更新 ${instance.displayName}`, `已同步 ${snapshot.workspace.name} 中的本地实例。`);
    return instance;
  },

  async listActivity(): Promise<ActivityRecord[]> {
    return state.activities;
  },

  async createBackup(workspaceRoot: string, relativePath: string): Promise<string> {
    return `${workspaceRoot}/.htyskillmanager/backups/mock/${relativePath}`;
  },

  async composerReadSkillDir(_dirPath: string) {
    return { files: [{ fileName: "SKILL.md", content: "---\nname: example\ndescription: Example skill\n---\n\n# Example\n\nContent here." }] };
  },
  async composerWriteSkillDir(_request: any) {
    return { dirPath: "mock://skill-dir", message: "mock saved" };
  },
  async composerListSkillDirs(_workspaceRoot: string, _provider: string) {
    return { dirs: [{ dirName: "example-skill", dirPath: "mock://example-skill" }] };
  },
  async composerResolveTargetDir(_request: any) {
    return { dirPath: "mock://target", exists: false };
  },

  async composerUpdateSkillMetadata(_request: { skillId: string; name: string; description: string }) {
    return { skillId: "mock", message: "metadata updated" };
  },

  async deleteSkill(skillId: string): Promise<{ skillId: string; message: string }> {
    const index = state.skills.findIndex((s) => s.skill.skillId === skillId);
    if (index === -1) throw new Error(`Skill not found: ${skillId}`);
    const removed = state.skills.splice(index, 1)[0];
    addActivity("delete", `删除 ${removed.skill.name}`, `删除 ${removed.versions.length} 个版本`);
    return { skillId, message: "skill deleted" };
  },

  async exportPackage(request: ExportPackageRequest): Promise<PackageOperationResponse> {
    addActivity("export", `导出 ${request.skillId} ${request.version}`, `导出到 ${request.outputPath}`);
    return {
      path: request.outputPath,
      message: "mock exported"
    };
  },

  async importPackage(request: ImportPackageRequest): Promise<PackageOperationResponse> {
    addActivity("import", "导入包", `从 ${request.packagePath} 导入`);
    return {
      path: request.packagePath,
      message: "mock imported"
    };
  },

  /* ── Cloud Market ── */

  async fetchMarketRegistry(_registryUrl: string): Promise<MarketRegistry> {
    return {
      schemaVersion: 1,
      updatedAt: now(),
      skills: [
        {
          skillId: "market_skill_001",
          slug: "code-review-agent",
          name: "Code Review Agent",
          description: "自动化代码审查技能，支持多语言和多框架。",
          author: "htyashes",
          tags: ["review", "automation"],
          latestVersion: "1.0.2",
          latestProviders: ["claude", "cursor"],
          versionCount: 2,
          createdAt: "2026-01-15T10:00:00Z",
          updatedAt: "2026-03-20T14:00:00Z",
          downloadCount: 42,
          versions: [
            {
              version: "1.0.2",
              publishedAt: "2026-03-20T14:00:00Z",
              notes: "修复格式化边界情况。",
              providers: ["claude", "cursor"],
              packageUrl: "packages/code-review-agent/1.0.2.htyskillpkg",
              packageSize: 15360
            },
            {
              version: "1.0.1",
              publishedAt: "2026-02-10T08:00:00Z",
              notes: "新增 Cursor 支持。",
              providers: ["claude", "cursor"],
              packageUrl: "packages/code-review-agent/1.0.1.htyskillpkg",
              packageSize: 14200
            }
          ]
        },
        {
          skillId: "market_skill_002",
          slug: "test-generator",
          name: "Test Generator",
          description: "根据代码自动生成单元测试。",
          author: "htyashes",
          tags: ["testing", "automation"],
          latestVersion: "2.0.0",
          latestProviders: ["codex", "claude", "cursor"],
          versionCount: 1,
          createdAt: "2026-02-01T09:00:00Z",
          updatedAt: "2026-03-15T11:00:00Z",
          downloadCount: 128,
          versions: [
            {
              version: "2.0.0",
              publishedAt: "2026-03-15T11:00:00Z",
              notes: "重构为模板驱动架构。",
              providers: ["codex", "claude", "cursor"],
              packageUrl: "packages/test-generator/2.0.0.htyskillpkg",
              packageSize: 22400
            }
          ]
        }
      ]
    };
  },

  async marketUploadPackage(_request: MarketUploadRequest): Promise<{ message: string }> {
    addActivity("market_upload", "上传到云端市场", "模拟上传技能包");
    return { message: "mock upload success" };
  },

  async marketDownloadAndImport(_request: MarketDownloadRequest): Promise<PackageOperationResponse> {
    addActivity("market_install", "从市场安装", "模拟下载并导入云端技能包");
    return {
      path: "mock://market-download",
      message: "mock market import"
    };
  },

  async getMarketSettings(): Promise<{ registryUrl: string }> {
    return { registryUrl: "" };
  },

  async updateMarketSettings(request: { registryUrl: string }): Promise<{ registryUrl: string }> {
    return { registryUrl: request.registryUrl };
  }
};
