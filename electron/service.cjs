const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const {
  discardMergeSession,
  getMergeSession,
  getMergeSessionFile,
  prepareMergeSession,
  readMergeSessionState,
  resolveMergeSessionFile,
  treesEqual
} = require("./merge-session.cjs");

const PROVIDERS = ["codex", "claude", "cursor"];
const SPECIAL_WORKSPACE_ID = "workspace_special_provider_global";
const SPECIAL_WORKSPACE_NAME = "特殊工作区";
const SPECIAL_WORKSPACE_ROOT = "hty://workspace/provider-global";
const SPECIAL_WORKSPACE_CREATED_AT = "1970-01-01T00:00:00Z";
const SPECIAL_WORKSPACE_STORAGE_NAME = "provider-global";

function createDesktopService({ defaultBaseDir }) {
  return new DesktopService(defaultBaseDir);
}

class DesktopService {
  constructor(defaultBaseDir) {
    this.defaultBaseDir = path.resolve(defaultBaseDir);
    ensureDir(this.defaultBaseDir);
    this.bootstrapPath = path.join(this.defaultBaseDir, "settings.json");

    const bootstrap = this.loadBootstrapConfig();
    const overrideRoot = typeof bootstrap.library_root_override === "string"
      ? bootstrap.library_root_override.trim()
      : "";
    if (overrideRoot) {
      ensureDir(overrideRoot);
      this.baseDir = path.resolve(overrideRoot);
    } else {
      this.baseDir = this.defaultBaseDir;
    }

    this.libraryPath = path.join(this.baseDir, "library.json");
    this.storeDir = path.join(this.baseDir, "store", "skills");
    this.mergeSessionsDir = path.join(this.baseDir, "merge-sessions");
    this._libraryCache = null;
    this._libraryCacheMtimeMs = 0;
    this.init();
  }

  invoke(command, args = {}) {
    switch (command) {
      case "get_dashboard":
        return this.getDashboard();
      case "get_app_settings":
        return this.getAppSettings();
      case "update_library_root":
        return this.updateLibraryRoot(args.request);
      case "rebuild_library_from_store":
        return this.rebuildLibraryFromStore();
      case "list_library":
        return this.listLibrary();
      case "get_skill_detail":
        return this.getSkillDetail(args.skillId);
      case "list_workspaces":
        return this.listWorkspaces();
      case "scan_workspace":
        return this.scanWorkspace(args.workspaceRoot, args.workspaceName);
      case "watch_workspace":
        return this.watchWorkspace(args.workspaceRoot, args.workspaceName);
      case "publish_to_global":
        return this.publishToGlobal(args.request);
      case "prepare_append_publish_merge":
        return this.prepareAppendPublishMerge(args.request);
      case "prepare_update_merge":
        return this.prepareUpdateMerge(args.request);
      case "get_merge_session":
        return this.getMergeSession(args.sessionId);
      case "get_merge_session_file":
        return this.getMergeSessionFile(args.sessionId, args.relativePath);
      case "resolve_merge_session_file":
        return this.resolveMergeSessionFile(args.request);
      case "commit_merge_session":
        return this.commitMergeSession(args.request);
      case "discard_merge_session":
        return this.discardMergeSession(args.sessionId);
      case "install_from_global":
        return this.installFromGlobal(args.request);
      case "bind_local_instance":
        return this.bindLocalInstance(args.request);
      case "update_bound_instance":
        return this.updateBoundInstance(args.request);
      case "list_activity":
        return this.listActivity(args);
      case "create_backup":
        return this.createBackup(args.workspaceRoot, args.relativePath);
      case "delete_skill":
        return this.deleteSkill(args.skillId);
      case "export_package":
        return this.exportPackage(args.request);
      case "import_package":
        return this.importPackage(args.request);
      case "composer_read_skill_dir":
        return this.composerReadSkillDir(args.dirPath);
      case "composer_write_skill_dir":
        return this.composerWriteSkillDir(args.request);
      case "composer_list_skill_dirs":
        return this.composerListSkillDirs(args.workspaceRoot, args.provider);
      case "composer_resolve_target_dir":
        return this.composerResolveTargetDir(args.request);
      case "composer_update_skill_metadata":
        return this.composerUpdateSkillMetadata(args.request);
      case "market_fetch_registry":
        return this.marketFetchRegistry(args.registryUrl);
      case "market_download_and_import":
        return this.marketDownloadAndImport(args.request);
      case "market_upload_package":
        return this.marketUploadPackage(args.request);
      case "get_market_settings":
        return this.getMarketSettings();
      case "update_market_settings":
        return this.updateMarketSettings(args.request);
      case "batch_update_instances":
        return this.batchUpdateInstances(args.items);
      default:
        throw new Error(`unknown desktop command: ${command}`);
    }
  }

  init() {
    ensureDir(this.baseDir);
    ensureDir(this.storeDir);
    ensureDir(this.mergeSessionsDir);
    ensureLibraryFile(this.libraryPath);
  }

  loadBootstrapConfig() {
    if (!fs.existsSync(this.bootstrapPath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(this.bootstrapPath, "utf8"));
  }

  writeBootstrapConfig(config) {
    ensureDir(path.dirname(this.bootstrapPath));
    fs.writeFileSync(this.bootstrapPath, JSON.stringify(config, null, 2), "utf8");
  }

  loadLibrary() {
    ensureLibraryFile(this.libraryPath);
    const stat = fs.statSync(this.libraryPath);
    if (this._libraryCache && stat.mtimeMs === this._libraryCacheMtimeMs) {
      return JSON.parse(JSON.stringify(this._libraryCache));
    }
    const data = JSON.parse(fs.readFileSync(this.libraryPath, "utf8"));
    this._libraryCache = data;
    this._libraryCacheMtimeMs = stat.mtimeMs;
    return JSON.parse(JSON.stringify(data));
  }

  saveLibrary(data) {
    fs.writeFileSync(this.libraryPath, JSON.stringify(data, null, 2), "utf8");
    this._libraryCache = JSON.parse(JSON.stringify(data));
    this._libraryCacheMtimeMs = fs.statSync(this.libraryPath).mtimeMs;
  }

  getDashboard() {
    const data = this.loadLibrary();
    const workspaces = this.listWorkspaces();
    let localInstanceCount = 0;
    let unboundInstanceCount = 0;
    const outdatedInstances = [];

    const skillMap = new Map();
    for (const entry of data.skills) {
      skillMap.set(entry.skill.skillId, entry.skill);
    }

    for (const workspace of workspaces) {
      try {
        const snapshot = this.scanWorkspace(workspace.rootPath, workspace.name);
        localInstanceCount += snapshot.instances.length;
        unboundInstanceCount += snapshot.instances.filter((instance) => instance.status === "unbound").length;

        for (const inst of snapshot.instances) {
          if (inst.status !== "bound" || !inst.linkedSkillId || !inst.appliedVersion) continue;
          const skill = skillMap.get(inst.linkedSkillId);
          if (!skill || !skill.latestVersion) continue;
          if (inst.appliedVersion !== skill.latestVersion) {
            outdatedInstances.push({
              workspaceId: workspace.workspaceId,
              workspaceName: workspace.name,
              workspaceRoot: workspace.rootPath,
              instanceId: inst.instanceId,
              instanceName: inst.displayName,
              provider: inst.provider,
              currentVersion: inst.appliedVersion,
              latestVersion: skill.latestVersion,
              skillId: skill.skillId,
              skillName: skill.name
            });
          }
        }
      } catch {
        // ignore unavailable workspaces during dashboard aggregation
      }
    }

    return {
      globalSkillCount: data.skills.length,
      versionCount: data.skills.reduce((total, skill) => total + skill.versions.length, 0),
      workspaceCount: workspaces.length,
      localInstanceCount,
      unboundInstanceCount,
      outdatedInstances,
      recentActivities: this.listActivity({ limit: 8 }),
      libraryRoot: normalizePath(this.baseDir),
      storeRoot: normalizePath(this.storeDir)
    };
  }

  getAppSettings() {
    return {
      defaultLibraryRoot: normalizePath(this.defaultBaseDir),
      libraryRoot: normalizePath(this.baseDir),
      storeRoot: normalizePath(this.storeDir),
      usingCustomLibraryRoot: !pathsMatch(this.baseDir, this.defaultBaseDir)
    };
  }

  updateLibraryRoot(request = {}) {
    const requestedRoot = typeof request.libraryRoot === "string" ? request.libraryRoot.trim() : "";
    const targetBaseDir = requestedRoot ? path.resolve(requestedRoot) : this.defaultBaseDir;

    if (request.moveExisting && !pathsMatch(targetBaseDir, this.baseDir)) {
      this.copyLibraryData(targetBaseDir);
    }

    ensureDir(targetBaseDir);

    this.writeBootstrapConfig({
      library_root_override: pathsMatch(targetBaseDir, this.defaultBaseDir)
        ? null
        : normalizePath(targetBaseDir)
    });

    const nextService = new DesktopService(this.defaultBaseDir);
    const data = nextService.loadLibrary();
    appendActivityRecord(
      data,
      "settings",
      "更新全局库路径",
      `全局库已切换到 ${normalizePath(nextService.baseDir)}${request.moveExisting ? "，并复制了现有全局库数据" : ""}`
    );
    nextService.saveLibrary(data);
    return nextService.getAppSettings();
  }

  rebuildLibraryFromStore() {
    if (!fs.existsSync(this.storeDir)) {
      return 0;
    }

    const data = this.loadLibrary();
    const existingSkillIds = new Set(data.skills.map((d) => d.skill.skillId));
    let recoveredCount = 0;

    for (const skillDirName of fs.readdirSync(this.storeDir)) {
      if (!skillDirName.startsWith("skill_")) {
        continue;
      }
      const skillDir = path.join(this.storeDir, skillDirName);
      if (!fs.statSync(skillDir).isDirectory()) {
        continue;
      }
      if (existingSkillIds.has(skillDirName)) {
        continue;
      }

      const versions = [];
      let firstDisplayName = null;

      for (const versionDirName of fs.readdirSync(skillDir)) {
        const versionDir = path.join(skillDir, versionDirName);
        if (!fs.statSync(versionDir).isDirectory()) {
          continue;
        }

        const providers = [];
        for (const providerDirName of fs.readdirSync(versionDir)) {
          if (!PROVIDERS.includes(providerDirName)) {
            continue;
          }
          const providerDir = path.join(versionDir, providerDirName);
          if (!fs.statSync(providerDir).isDirectory()) {
            continue;
          }

          for (const displayDirName of fs.readdirSync(providerDir)) {
            const displayDir = path.join(providerDir, displayDirName);
            if (!fs.statSync(displayDir).isDirectory()) {
              continue;
            }
            if (!firstDisplayName) {
              firstDisplayName = displayDirName;
            }
            providers.push({
              provider: providerDirName,
              payloadPath: normalizePath(path.relative(this.baseDir, displayDir)),
              displayName: displayDirName
            });
          }
        }

        if (providers.length > 0) {
          let publishedAt;
          try {
            publishedAt = fs.statSync(versionDir).mtime.toISOString();
          } catch {
            publishedAt = nowIso();
          }
          versions.push({
            skillId: skillDirName,
            version: versionDirName,
            publishedAt,
            notes: "",
            publishedFromWorkspaceId: null,
            providers
          });
        }
      }

      if (versions.length === 0) {
        continue;
      }

      const name = firstDisplayName || skillDirName;
      const slug = uniqueSlug(data.skills, name);
      const sorted = [...versions].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
      const earliest = sorted[0].publishedAt;
      const latest = sorted[sorted.length - 1].publishedAt;
      const latestVersion = sorted[sorted.length - 1];

      data.skills.push({
        skill: {
          skillId: skillDirName,
          slug,
          name,
          description: "",
          tags: [],
          latestVersion: latestVersion.version,
          latestProviders: latestVersion.providers.map((p) => p.provider),
          versionCount: versions.length,
          createdAt: earliest
        },
        versions
      });
      existingSkillIds.add(skillDirName);
      recoveredCount += 1;
    }

    if (recoveredCount > 0) {
      appendActivityRecord(
        data,
        "rebuild",
        `从 store 恢复了 ${recoveredCount} 个 Skill`,
        "数据库记录已根据 store 目录结构重建。"
      );
      this.saveLibrary(data);
    }

    return recoveredCount;
  }

  copyLibraryData(targetBaseDir) {
    ensureDir(targetBaseDir);

    if (fs.existsSync(this.libraryPath)) {
      fs.copyFileSync(this.libraryPath, path.join(targetBaseDir, "library.json"));
    }

    const sourceStoreRoot = path.join(this.baseDir, "store");
    const targetStoreRoot = path.join(targetBaseDir, "store");
    if (fs.existsSync(sourceStoreRoot)) {
      copyDir(sourceStoreRoot, targetStoreRoot);
    }

    const sourceSpecialWorkspaces = path.join(this.baseDir, "special-workspaces");
    const targetSpecialWorkspaces = path.join(targetBaseDir, "special-workspaces");
    if (fs.existsSync(sourceSpecialWorkspaces)) {
      copyDir(sourceSpecialWorkspaces, targetSpecialWorkspaces);
    }
  }

  listLibrary() {
    const data = this.loadLibrary();
    return data.skills
      .map((detail) => buildSkillSummary(detail))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getSkillDetail(skillId) {
    const data = this.loadLibrary();
    const detail = data.skills.find((item) => item.skill.skillId === skillId);
    if (!detail) {
      throw new Error(`skill not found: ${skillId}`);
    }

    return {
      skill: buildSkillSummary(detail),
      versions: sortVersions(detail.versions).map((version) => ({
        ...version,
        providers: [...version.providers].sort((left, right) => left.provider.localeCompare(right.provider))
      }))
    };
  }

  listWorkspaces() {
    const data = this.loadLibrary();
    const standardWorkspaces = [...data.workspaces].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
    return [this.specialWorkspaceRecord(), ...standardWorkspaces];
  }
  scanWorkspace(workspaceRoot, workspaceName) {
    const context = this.resolveWorkspaceContext(workspaceRoot);
    const workspace = this.workspaceRecordForContext(context, workspaceName);
    const indexesDir = this.indexesDirForContext(context);
    ensureDir(indexesDir);

    const data = this.loadLibrary();
    const skillIds = new Set(data.skills.map((s) => s.skill.skillId));
    const existingIndexes = this.loadIndexMap(indexesDir);
    const instances = [];

    for (const provider of PROVIDERS) {
      const providerRoot = this.scanProviderRoot(context, provider);
      if (!providerRoot || !fs.existsSync(providerRoot)) {
        continue;
      }

      const entries = fs.readdirSync(providerRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) {
          continue;
        }

        const instancePath = path.join(providerRoot, entry.name);
        const relativePath = this.relativePathForContext(context, instancePath);
        const key = indexKey(provider, relativePath);
        const now = nowIso();

        let indexPath;
        let index;
        const existing = existingIndexes.get(key);
        if (existing) {
          indexPath = existing.indexPath;
          index = existing.index;
          existingIndexes.delete(key);
        } else {
          const instanceId = randomUUID();
          indexPath = path.join(indexesDir, `${instanceId}.htyVersion`);
          index = {
            schemaVersion: 2,
            instanceId,
            workspaceRoot,
            provider,
            relativePath,
            linkedSkillId: null,
            linkedVersion: null,
            appliedSkillId: null,
            appliedVersion: null,
            displayName: entry.name,
            createdAt: now
          };
        }

        const dirty = !existing ||
          index.workspaceRoot !== workspaceRoot ||
          index.provider !== provider ||
          index.relativePath !== relativePath ||
          index.displayName !== entry.name;

        if (dirty) {
          index.workspaceRoot = workspaceRoot;
          index.provider = provider;
          index.relativePath = relativePath;
          index.displayName = entry.name;
          this.writeIndexFile(indexPath, index);
        }

        instances.push(localInstanceFromIndex(workspace, this.displayIndexPath(context, indexPath), index, skillIds));
      }
    }

    instances.sort((left, right) =>
      left.provider.localeCompare(right.provider) || left.displayName.localeCompare(right.displayName)
    );

    return { workspace, instances };
  }

  watchWorkspace(workspaceRoot, workspaceName) {
    return this.scanWorkspace(workspaceRoot, workspaceName);
  }

  listActivity(filters = {}) {
    const data = this.loadLibrary();
    let result = [...data.activities]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    if (filters.kind) {
      result = result.filter((a) => a.kind === filters.kind);
    }
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      result = result.filter((a) =>
        a.title.toLowerCase().includes(needle) ||
        a.detail.toLowerCase().includes(needle)
      );
    }
    const limit = filters.limit || 100;
    return result.slice(0, limit);
  }

  bindLocalInstance(request) {
    const context = this.resolveWorkspaceContext(request.workspaceRoot);
    const workspace = this.workspaceRecordForContext(context, null);
    const indexesDir = this.indexesDirForContext(context);
    const { indexPath, index } = this.findIndexByInstanceId(indexesDir, request.instanceId);
    const existingIndexes = [...this.loadIndexMap(indexesDir).values()].map((entry) => entry.index);

    this.getLibraryDetailRecord(request.skillId);

    const duplicate = existingIndexes.some((existing) =>
      existing.instanceId !== request.instanceId &&
      existing.provider === index.provider &&
      existing.linkedSkillId === request.skillId
    );
    if (duplicate) {
      throw new Error("同一个全局 Skill 在当前工作区的同一 provider 下只能绑定一个本地实例。");
    }

    index.linkedSkillId = request.skillId;
    index.linkedVersion = null;
    this.writeIndexFile(indexPath, index);

    const data = this.loadLibrary();
    const skillIds = new Set(data.skills.map((s) => s.skill.skillId));
    return localInstanceFromIndex(workspace, this.displayIndexPath(context, indexPath), index, skillIds);
  }

  updateBoundInstance(request) {
    const preview = this.prepareUpdateMerge(request);
    if (preview.action === "noop") {
      const context = this.resolveWorkspaceContext(request.workspaceRoot);
      const workspace = this.workspaceRecordForContext(context, null);
      const indexesDir = this.indexesDirForContext(context);
      const { indexPath, index } = this.findIndexByInstanceId(indexesDir, request.instanceId);
      const data = this.loadLibrary();
      const skillIds = new Set(data.skills.map((s) => s.skill.skillId));
      return localInstanceFromIndex(workspace, this.displayIndexPath(context, indexPath), index, skillIds);
    }

    if (preview.action === "needs_resolution") {
      throw new Error("检测到内容冲突，请先完成手动冲突处理。");
    }

    this.commitMergeSession({ sessionId: preview.sessionId });

    const context = this.resolveWorkspaceContext(request.workspaceRoot);
    const workspace = this.workspaceRecordForContext(context, null);
    const indexesDir = this.indexesDirForContext(context);
    const { indexPath, index } = this.findIndexByInstanceId(indexesDir, request.instanceId);
    const data = this.loadLibrary();
    const skillIds = new Set(data.skills.map((s) => s.skill.skillId));
    return localInstanceFromIndex(workspace, this.displayIndexPath(context, indexPath), index, skillIds);
  }

  batchUpdateInstances(items = []) {
    const results = { updated: 0, skipped: 0, conflicted: 0, failed: 0, details: [] };
    for (const item of items) {
      try {
        const preview = this.prepareUpdateMerge({
          workspaceRoot: item.workspaceRoot,
          instanceId: item.instanceId,
          force: false
        });
        if (preview.action === "noop") {
          results.skipped++;
          results.details.push({ instanceId: item.instanceId, status: "skipped" });
          continue;
        }
        if (preview.action === "needs_resolution") {
          this.discardMergeSession(preview.sessionId);
          results.conflicted++;
          results.details.push({ instanceId: item.instanceId, status: "conflicted" });
          continue;
        }
        this.commitMergeSession({ sessionId: preview.sessionId });
        results.updated++;
        results.details.push({ instanceId: item.instanceId, status: "updated" });
      } catch (err) {
        results.failed++;
        results.details.push({ instanceId: item.instanceId, status: "failed", error: err.message });
      }
    }
    return results;
  }

  publishToGlobal(request) {
    const context = this.resolveWorkspaceContext(request.workspaceRoot);
    const workspace = this.workspaceRecordForContext(context, null);
    const indexesDir = this.indexesDirForContext(context);
    const { indexPath, index } = this.findIndexByInstanceId(indexesDir, request.instanceId);
    const sourceDir = this.resolveInstanceSourceDir(context, index);
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`source instance does not exist: ${normalizePath(sourceDir)}`);
    }

    if (request.skillMode === "append") {
      const preview = this.prepareAppendPublishMerge(request);
      if (preview.action === "needs_resolution") {
        throw new Error("检测到内容冲突，请先完成手动冲突处理。");
      }

      const committed = this.commitMergeSession({ sessionId: preview.sessionId });
      return {
        skillId: committed.skillId,
        version: committed.version,
        providers: committed.providers
      };
    }

    const providers = normalizePublishProviders(request.providers);
    const data = this.loadLibrary();
    const now = nowIso();
    const name = request.name || index.displayName;

    // Check for name conflict
    const conflict = data.skills.find((s) => s.skill.name === name);
    if (conflict) {
      if (!request.forceReplace) {
        const err = new Error(`NAME_CONFLICT: 全局库中已有同名技能 "${name}"`);
        err.code = "NAME_CONFLICT";
        err.conflictSkillId = conflict.skill.skillId;
        err.conflictName = conflict.skill.name;
        throw err;
      }
      // Remove conflicting skill
      this.deleteSkill(conflict.skill.skillId);
      // Reload library after deletion
      const freshData = this.loadLibrary();
      Object.assign(data, freshData);
    }

    const slug = uniqueSlug(data.skills, request.slug || name);
    const skillId = `skill_${randomUUID().replace(/-/g, "")}`;
    const version = "1.0.0";
    const detail = {
      skill: {
        skillId,
        slug,
        name,
        description: request.description || "",
        tags: request.tags || [],
        latestVersion: null,
        latestProviders: [],
        versionCount: 0,
        createdAt: now
      },
      versions: []
    };
    data.skills.unshift(detail);

    this.writePublishVersion({
      data,
      detail,
      skillId,
      version,
      sourceDir,
      displayName: index.displayName,
      providers,
      notes: request.notes || "",
      workspaceId: workspace.workspaceId
    });

    index.linkedSkillId = skillId;
    index.linkedVersion = version;
    index.appliedSkillId = skillId;
    index.appliedVersion = version;
    this.writeIndexFile(indexPath, index);

    appendActivityRecord(
      data,
      "publish",
      `发布 ${index.displayName} ${version}`,
      `从 ${workspace.name} 上传到全局，生成 ${providers.length} 个 provider 变体。`
    );
    this.saveLibrary(data);

    return {
      skillId,
      version,
      providers
    };
  }

  prepareAppendPublishMerge(request) {
    if (request.skillMode !== "append" || !request.existingSkillId) {
      throw new Error("prepare_append_publish_merge only supports append mode");
    }

    const context = this.resolveWorkspaceContext(request.workspaceRoot);
    const indexesDir = this.indexesDirForContext(context);
    const { index } = this.findIndexByInstanceId(indexesDir, request.instanceId);
    const sourceDir = this.resolveInstanceSourceDir(context, index);
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`source instance does not exist: ${normalizePath(sourceDir)}`);
    }

    const detail = this.getLibraryDetailRecord(request.existingSkillId);
    const latestVersion = sortVersions(detail.versions)[0] ?? null;
    const targetVariant = latestVersion ? selectVersionVariant(latestVersion, index.provider) : null;
    const targetDir = targetVariant ? this.ensureVariantPayloadDir(targetVariant) : null;

    let baseDir = null;
    if (index.appliedSkillId === request.existingSkillId && index.appliedVersion) {
      const appliedDetail = this.getLibraryDetailRecord(index.appliedSkillId);
      const appliedVersion = appliedDetail.versions.find((entry) => entry.version === index.appliedVersion) ?? null;
      const appliedVariant = appliedVersion ? selectVersionVariant(appliedVersion, index.provider) : null;
      if (appliedVariant) {
        baseDir = this.ensureVariantPayloadDir(appliedVariant);
      }
    }

    return prepareMergeSession({
      sessionsRoot: this.mergeSessionsDir,
      operation: "publish_append",
      title: `追加上传 ${index.displayName}`,
      description: latestVersion
        ? `将比较本地内容与 ${detail.skill.name} ${latestVersion.version}，必要时进入冲突处理。`
        : `目标 Skill 还没有版本，当前内容会作为首个版本的基线。`,
      displayName: index.displayName,
      sourceLabel: "本地实例",
      targetLabel: latestVersion ? `${detail.skill.name} ${latestVersion.version}` : `${detail.skill.name} 首个版本`,
      metadata: {
        workspaceRoot: request.workspaceRoot,
        instanceId: request.instanceId,
        providers: normalizePublishProviders(request.providers),
        existingSkillId: request.existingSkillId,
        notes: request.notes || ""
      },
      baseRoot: baseDir,
      localRoot: sourceDir,
      targetRoot: targetDir
    });
  }

  prepareUpdateMerge(request) {
    const context = this.resolveWorkspaceContext(request.workspaceRoot);
    const indexesDir = this.indexesDirForContext(context);
    const { index } = this.findIndexByInstanceId(indexesDir, request.instanceId);

    if (!index.linkedSkillId) {
      throw new Error("只能更新已绑定实例。");
    }

    const detail = this.getLibraryDetailRecord(index.linkedSkillId);
    const targetVersionRecord = request.targetVersion
      ? detail.versions.find((v) => v.version === request.targetVersion)
      : sortVersions(detail.versions)[0];
    if (!targetVersionRecord) {
      throw new Error(request.targetVersion ? `版本 ${request.targetVersion} 不存在。` : "绑定的 Skill 没有已发布的版本。");
    }

    if (!request.force && index.appliedSkillId === index.linkedSkillId && index.appliedVersion === targetVersionRecord.version) {
      return {
        action: "noop",
        operation: "update",
        message: request.targetVersion ? "当前已是该版本，无需回溯。" : "已是最新版本，无需更新。"
      };
    }

    const targetVariant = selectVersionVariant(targetVersionRecord, index.provider);
    if (!targetVariant) {
      throw new Error(`目标版本不存在 ${index.provider} provider 变体。`);
    }

    const localDir = this.resolveInstanceSourceDir(context, index);
    const targetDir = this.ensureVariantPayloadDir(targetVariant);
    let baseDir = null;

    if (index.appliedSkillId && index.appliedVersion) {
      try {
        const appliedDetail = this.getLibraryDetailRecord(index.appliedSkillId);
        const appliedVersion = appliedDetail.versions.find((entry) => entry.version === index.appliedVersion) ?? null;
        const appliedVariant = appliedVersion ? selectVersionVariant(appliedVersion, index.provider) : null;
        if (appliedVariant) {
          baseDir = this.ensureVariantPayloadDir(appliedVariant);
        }
      } catch {
        // appliedSkill 可能已被删除，忽略
      }
    }

    return prepareMergeSession({
      sessionsRoot: this.mergeSessionsDir,
      operation: "update",
      title: request.targetVersion ? `回溯 ${index.displayName}` : `更新 ${index.displayName}`,
      description: `比较本地内容与目标版本 ${targetVersionRecord.version}，必要时进入冲突处理。`,
      displayName: index.displayName,
      sourceLabel: "本地实例",
      targetLabel: `${detail.skill.name} ${targetVersionRecord.version}`,
      metadata: {
        workspaceRoot: request.workspaceRoot,
        instanceId: request.instanceId,
        targetVersion: targetVersionRecord.version
      },
      baseRoot: baseDir,
      localRoot: localDir,
      targetRoot: targetDir
    });
  }

  getMergeSession(sessionId) {
    return getMergeSession(this.mergeSessionsDir, sessionId);
  }

  getMergeSessionFile(sessionId, relativePath) {
    return getMergeSessionFile(this.mergeSessionsDir, sessionId, relativePath);
  }

  resolveMergeSessionFile(request) {
    return resolveMergeSessionFile(this.mergeSessionsDir, request);
  }

  discardMergeSession(sessionId) {
    return discardMergeSession(this.mergeSessionsDir, sessionId);
  }

  commitMergeSession(request) {
    const state = readMergeSessionState(this.mergeSessionsDir, request.sessionId);
    if (state.meta.files.some((entry) => entry.status === "conflict")) {
      throw new Error("仍有未处理的冲突文件。");
    }

    if (state.meta.operation === "update") {
      return this.commitUpdateMerge(state);
    }

    if (state.meta.operation === "publish_append") {
      return this.commitAppendPublishMerge(state);
    }

    throw new Error(`unsupported merge operation: ${state.meta.operation}`);
  }

  commitUpdateMerge(state) {
    const { workspaceRoot, instanceId } = state.meta.metadata;
    const context = this.resolveWorkspaceContext(workspaceRoot);
    const workspace = this.workspaceRecordForContext(context, null);
    const indexesDir = this.indexesDirForContext(context);
    const { indexPath, index } = this.findIndexByInstanceId(indexesDir, instanceId);
    const targetDir = this.resolveInstanceSourceDir(context, index);

    if (!treesEqual(state.paths.localRoot, state.paths.resultRoot)) {
      if (fs.existsSync(targetDir)) {
        this.backupTargetForContext(context, targetDir, index.provider);
      }
      copyDir(state.paths.resultRoot, targetDir);
    }

    const targetVersion = state.meta.metadata.targetVersion || index.linkedVersion;
    index.appliedSkillId = index.linkedSkillId;
    index.appliedVersion = targetVersion;
    index.linkedVersion = targetVersion;
    this.writeIndexFile(indexPath, index);

    const data = this.loadLibrary();
    appendActivityRecord(
      data,
      "update",
      `更新 ${index.displayName}`,
      `已从 ${index.linkedSkillId} ${targetVersion} 的 ${index.provider} provider 变体同步到 ${workspace.name}。`
    );
    this.saveLibrary(data);
    discardMergeSession(this.mergeSessionsDir, state.meta.sessionId);

    return {
      sessionId: state.meta.sessionId,
      operation: "update",
      workspaceRoot,
      instanceId,
      message: "已应用合并结果并更新本地实例。"
    };
  }

  commitAppendPublishMerge(state) {
    const metadata = state.meta.metadata;
    const context = this.resolveWorkspaceContext(metadata.workspaceRoot);
    const workspace = this.workspaceRecordForContext(context, null);
    const indexesDir = this.indexesDirForContext(context);
    const { indexPath, index } = this.findIndexByInstanceId(indexesDir, metadata.instanceId);
    const localDir = this.resolveInstanceSourceDir(context, index);
    const data = this.loadLibrary();
    const detail = data.skills.find((item) => item.skill.skillId === metadata.existingSkillId);
    if (!detail) {
      throw new Error(`skill not found: ${metadata.existingSkillId}`);
    }

    const latestVersion = sortVersions(detail.versions)[0]?.version ?? null;
    const version = latestVersion ? bumpPatchVersion(latestVersion) : "1.0.0";

    this.writePublishVersion({
      data,
      detail,
      skillId: metadata.existingSkillId,
      version,
      sourceDir: state.paths.resultRoot,
      displayName: index.displayName,
      providers: metadata.providers,
      notes: metadata.notes,
      workspaceId: workspace.workspaceId
    });

    if (!treesEqual(state.paths.localRoot, state.paths.resultRoot)) {
      if (fs.existsSync(localDir)) {
        this.backupTargetForContext(context, localDir, index.provider);
      }
      copyDir(state.paths.resultRoot, localDir);
    }

    index.linkedSkillId = metadata.existingSkillId;
    index.linkedVersion = version;
    index.appliedSkillId = metadata.existingSkillId;
    index.appliedVersion = version;
    this.writeIndexFile(indexPath, index);

    appendActivityRecord(
      data,
      "publish",
      `发布 ${index.displayName} ${version}`,
      `从 ${workspace.name} 追加上传到 ${metadata.existingSkillId}，生成 ${metadata.providers.length} 个 provider 变体。`
    );
    this.saveLibrary(data);
    discardMergeSession(this.mergeSessionsDir, state.meta.sessionId);

    return {
      sessionId: state.meta.sessionId,
      operation: "publish_append",
      skillId: metadata.existingSkillId,
      version,
      providers: metadata.providers,
      message: "已发布合并结果并同步本地实例。"
    };
  }

  writePublishVersion({
    detail,
    skillId,
    version,
    sourceDir,
    displayName,
    providers,
    notes,
    workspaceId
  }) {
    const now = nowIso();
    const versionRecord = {
      skillId,
      version,
      publishedAt: now,
      notes,
      publishedFromWorkspaceId: workspaceId,
      providers: []
    };

    for (const provider of providers) {
      const targetDir = path.join(
        this.storeDir,
        skillId,
        version,
        provider,
        sanitizeFileName(displayName)
      );
      copyDir(sourceDir, targetDir);
      versionRecord.providers.push({
        provider,
        payloadPath: normalizePath(path.relative(this.baseDir, targetDir)),
        displayName
      });
    }

    detail.versions.unshift(versionRecord);
    detail.skill.latestVersion = version;
    detail.skill.latestProviders = [...providers];
    detail.skill.versionCount = detail.versions.length;
  }

  installFromGlobal(request) {
    const context = this.resolveWorkspaceContext(request.workspaceRoot);
    const workspace = this.workspaceRecordForContext(context, null);
    const data = this.loadLibrary();
    const detail = data.skills.find((item) => item.skill.skillId === request.skillId);
    const version = detail?.versions.find((item) => item.version === request.version);
    if (!detail || !version || !version.providers.length) {
      throw new Error("version has no provider variants");
    }

    const requestedProviders = request.providers?.length
      ? request.providers
      : version.providers.map((variant) => variant.provider);

    const indexesDir = this.indexesDirForContext(context);
    ensureDir(indexesDir);
    const existingIndexes = this.loadIndexMap(indexesDir);
    const installedTargets = [];

    for (const provider of requestedProviders) {
      const variant = version.providers.find((item) => item.provider === provider);
      if (!variant) {
        throw new Error(`requested provider variant does not exist: ${provider}`);
      }

      const sourceDir = this.ensureVariantPayloadDir(variant);

      if (workspace.kind === "special" && !workspace.availableProviders.includes(provider)) {
        throw new Error(`特殊工作区未发现 ${provider} 对应的全局路径，不能安装该 provider。`);
      }

      const providerRoot = this.installProviderRoot(context, provider);
      if (context.kind === "standard") {
        ensureDir(providerRoot);
      }

      const targetDir = path.join(providerRoot, variant.displayName);
      if (fs.existsSync(targetDir)) {
        this.backupTargetForContext(context, targetDir, provider);
      }

      copyDir(sourceDir, targetDir);

      const relativePath = this.relativePathForContext(context, targetDir);
      const key = indexKey(provider, relativePath);
      const existing = existingIndexes.get(key);
      const now = nowIso();

      const indexPath = existing?.indexPath ?? path.join(indexesDir, `${randomUUID()}.htyVersion`);
      const index = existing?.index ?? {
        schemaVersion: 2,
        instanceId: randomUUID(),
        workspaceRoot: request.workspaceRoot,
        provider,
        relativePath,
        linkedSkillId: null,
        linkedVersion: null,
        appliedSkillId: null,
        appliedVersion: null,
        displayName: variant.displayName,
        createdAt: now
      };

      index.workspaceRoot = request.workspaceRoot;
      index.provider = provider;
      index.relativePath = relativePath;
      index.displayName = variant.displayName;
      index.linkedSkillId = request.skillId;
      index.linkedVersion = request.version;
      index.appliedSkillId = request.skillId;
      index.appliedVersion = request.version;
      this.writeIndexFile(indexPath, index);

      installedTargets.push({
        provider,
        targetPath: relativePath
      });
    }

    appendActivityRecord(
      data,
      "install",
      `安装 ${request.skillId} ${request.version}`,
      `安装到工作区 ${workspace.name}，覆盖 ${installedTargets.length} 个 provider 目标。`
    );
    this.saveLibrary(data);

    return {
      workspaceId: workspace.workspaceId,
      workspaceRoot: workspace.rootPath,
      version: request.version,
      installedTargets
    };
  }

  createBackup(workspaceRoot, relativePath) {
    const context = this.resolveWorkspaceContext(workspaceRoot);
    if (context.kind === "standard") {
      return this.backupExistingTarget(context.rootPath, relativePath);
    }

    const target = path.resolve(relativePath);
    const provider = this.specialProviderFromTargetPath(target);
    if (!provider) {
      throw new Error(`无法从目标路径识别 provider: ${normalizePath(target)}`);
    }
    return this.backupTargetForContext(context, target, provider);
  }

  deleteSkill(skillId) {
    const data = this.loadLibrary();
    const index = data.skills.findIndex((item) => item.skill.skillId === skillId);
    if (index === -1) {
      throw new Error(`skill not found: ${skillId}`);
    }
    const removed = data.skills.splice(index, 1)[0];

    // Delete skill directory on disk
    const skillDir = path.join(this.storeDir, skillId);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }

    appendActivityRecord(
      data,
      "delete",
      `删除 ${removed.skill.name}`,
      `删除 ${removed.versions.length} 个版本`
    );
    this.saveLibrary(data);

    return {
      skillId,
      message: "skill deleted"
    };
  }

  exportPackage(request) {
    const detail = this.getSkillDetail(request.skillId);
    const version = detail.versions.find((entry) => entry.version === request.version);
    if (!version) {
      throw new Error(`version not found: ${request.version}`);
    }

    const outputPath = path.resolve(request.outputPath);
    ensureDir(path.dirname(outputPath));

    const exportedAt = nowIso();
    const packageData = {
      schemaVersion: 1,
      exportedAt,
      manifest: {
        schemaVersion: 1,
        exportedAt,
        skillId: detail.skill.skillId,
        slug: detail.skill.slug,
        name: detail.skill.name,
        description: detail.skill.description,
        tags: detail.skill.tags,
        version: version.version,
        publishedAt: version.publishedAt,
        notes: version.notes,
        publishedFromWorkspaceId: version.publishedFromWorkspaceId,
        variants: version.providers
      },
      payloads: version.providers.map((variant) => ({
        provider: variant.provider,
        displayName: variant.displayName,
        files: collectFiles(path.join(this.baseDir, variant.payloadPath))
      }))
    };

    fs.writeFileSync(outputPath, JSON.stringify(packageData, null, 2), "utf8");

    const data = this.loadLibrary();
    appendActivityRecord(
      data,
      "export",
      `导出 ${detail.skill.name} ${request.version}`,
      `导出到 ${normalizePath(outputPath)}`
    );
    this.saveLibrary(data);

    return {
      path: normalizePath(outputPath),
      message: "package exported"
    };
  }

  importPackage(request) {
    const packagePath = path.resolve(request.packagePath);
    const packageData = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const manifest = packageData.manifest;

    this.ensureVersionNotExists(manifest.skillId, manifest.version);
    const data = this.loadLibrary();

    // Check for name conflict (different skillId, same name)
    const conflict = data.skills.find(
      (s) => s.skill.name === manifest.name && s.skill.skillId !== manifest.skillId
    );
    if (conflict) {
      if (!request.forceReplace) {
        const err = new Error(`NAME_CONFLICT: 全局库中已有同名技能 "${manifest.name}"`);
        err.code = "NAME_CONFLICT";
        err.conflictSkillId = conflict.skill.skillId;
        err.conflictName = conflict.skill.name;
        throw err;
      }
      // Remove conflicting skill
      this.deleteSkill(conflict.skill.skillId);
      // Reload library after deletion
      const freshData = this.loadLibrary();
      Object.assign(data, freshData);
    }

    let detail = data.skills.find((item) => item.skill.skillId === manifest.skillId);
    if (!detail) {
      detail = {
        skill: {
          skillId: manifest.skillId,
          slug: manifest.slug,
          name: manifest.name,
          description: manifest.description,
          tags: manifest.tags,
          latestVersion: manifest.version,
          latestProviders: manifest.variants.map((variant) => variant.provider),
          versionCount: 0,
          createdAt: manifest.exportedAt
        },
        versions: []
      };
      data.skills.unshift(detail);
    }

    detail.versions.unshift({
      skillId: manifest.skillId,
      version: manifest.version,
      publishedAt: manifest.publishedAt,
      notes: manifest.notes,
      publishedFromWorkspaceId: manifest.publishedFromWorkspaceId ?? null,
      providers: manifest.variants
    });
    detail.skill.latestVersion = sortVersions(detail.versions)[0]?.version ?? manifest.version;
    detail.skill.latestProviders = sortVersions(detail.versions)[0]?.providers.map((variant) => variant.provider) ?? [];
    detail.skill.versionCount = detail.versions.length;

    for (const payload of packageData.payloads ?? []) {
      const variant = manifest.variants.find((item) => item.provider === payload.provider);
      if (!variant) {
        continue;
      }

      const targetDir = path.join(this.baseDir, variant.payloadPath);
      fs.rmSync(targetDir, { recursive: true, force: true });
      ensureDir(targetDir);

      for (const file of payload.files ?? []) {
        const output = path.join(targetDir, file.path);
        ensureDir(path.dirname(output));
        fs.writeFileSync(output, Buffer.from(file.content, "base64"));
      }
    }

    appendActivityRecord(
      data,
      "import",
      `导入 ${manifest.name} ${manifest.version}`,
      `从 ${normalizePath(packagePath)} 导入全局库`
    );
    this.saveLibrary(data);

    return {
      path: normalizePath(packagePath),
      message: "package imported"
    };
  }

  /* ── Composer ── */

  composerReadSkillDir(dirPath) {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      return { files: [] };
    }
    const files = [];
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && !entry.name.startsWith(".")) {
        const content = fs.readFileSync(path.join(resolved, entry.name), "utf8");
        files.push({ fileName: entry.name, content });
      }
    }
    return { files };
  }

  composerWriteSkillDir(request) {
    const { dirPath, files } = request;
    const resolved = path.resolve(dirPath);
    ensureDir(resolved);

    // Remove files that no longer exist in the new set
    if (fs.existsSync(resolved)) {
      const existing = fs.readdirSync(resolved, { withFileTypes: true });
      const newNames = new Set(files.map((f) => f.fileName));
      for (const entry of existing) {
        if (entry.isFile() && !newNames.has(entry.name)) {
          fs.unlinkSync(path.join(resolved, entry.name));
        }
      }
    }

    // Write all files
    for (const file of files) {
      fs.writeFileSync(path.join(resolved, file.fileName), file.content, "utf8");
    }

    return { dirPath: normalizePath(resolved), message: "skill saved" };
  }

  composerListSkillDirs(workspaceRoot, provider) {
    const providerDir = path.join(path.resolve(workspaceRoot), rootRelative(provider));
    if (!fs.existsSync(providerDir)) {
      return { dirs: [] };
    }
    const dirs = [];
    const entries = fs.readdirSync(providerDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        dirs.push({
          dirName: entry.name,
          dirPath: normalizePath(path.join(providerDir, entry.name))
        });
      }
    }
    return { dirs };
  }

  composerResolveTargetDir(request) {
    const { workspaceRoot, provider, skillName } = request;
    const dirPath = path.join(path.resolve(workspaceRoot), rootRelative(provider), skillName);
    return {
      dirPath: normalizePath(dirPath),
      exists: fs.existsSync(dirPath)
    };
  }

  composerUpdateSkillMetadata(request) {
    const { skillId, name, description } = request;
    const data = this.loadLibrary();
    const detail = data.skills.find((s) => s.skill.skillId === skillId);
    if (!detail) {
      throw new Error(`skill not found: ${skillId}`);
    }

    const oldName = detail.skill.name;
    detail.skill.name = name || detail.skill.name;
    detail.skill.description = description ?? detail.skill.description;

    appendActivityRecord(
      data,
      "edit",
      `编辑 ${detail.skill.name}`,
      oldName !== detail.skill.name ? `重命名: ${oldName} → ${detail.skill.name}` : "更新技能内容"
    );
    this.saveLibrary(data);

    return { skillId, message: "metadata updated" };
  }

  /* ── Cloud Market ── */

  async marketFetchRegistry(registryUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const bustUrl = registryUrl + (registryUrl.includes("?") ? "&" : "?") + "_t=" + Date.now();
      const response = await fetch(bustUrl, {
        signal: controller.signal,
        headers: { "Cache-Control": "no-cache" }
      });
      if (response.status === 404) {
        return { schemaVersion: 1, updatedAt: nowIso(), skills: [] };
      }
      if (!response.ok) {
        throw new Error(`registry request failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async marketDownloadAndImport(request) {
    const { registryBaseUrl, packageUrl, skillId, version, forceReplace } = request;

    const resolvedUrl = packageUrl.startsWith("http")
      ? packageUrl
      : `${registryBaseUrl.replace(/\/[^/]*$/, "/")}${packageUrl}`;

    const cacheDir = path.join(this.baseDir, "market-cache");
    ensureDir(cacheDir);
    const tempFile = path.join(cacheDir, `${skillId}-${version}.htyskillpkg`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(resolvedUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`package download failed: ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(tempFile, buffer);
    } finally {
      clearTimeout(timeout);
    }

    try {
      const result = this.importPackage({ packagePath: tempFile, forceReplace });
      return result;
    } finally {
      try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
    }
  }

  getMarketSettings() {
    const bootstrap = this.loadBootstrapConfig();
    return {
      registryUrl: bootstrap.market_registry_url || ""
    };
  }

  updateMarketSettings(request) {
    const bootstrap = this.loadBootstrapConfig();
    bootstrap.market_registry_url = request.registryUrl || "";
    this.writeBootstrapConfig(bootstrap);
    return { registryUrl: bootstrap.market_registry_url };
  }

  async marketUploadPackage(request) {
    const { skillId, version, githubToken, owner, repo, branch } = request;

    const detail = this.getLibraryDetailRecord(skillId);
    const versionRecord = detail.versions.find((v) => v.version === version);
    if (!versionRecord) {
      throw new Error(`version not found: ${version}`);
    }

    const exportedAt = nowIso();
    const packageData = {
      schemaVersion: 1,
      exportedAt,
      manifest: {
        schemaVersion: 1,
        exportedAt,
        skillId: detail.skill.skillId,
        slug: detail.skill.slug,
        name: detail.skill.name,
        description: detail.skill.description,
        tags: detail.skill.tags,
        version: versionRecord.version,
        publishedAt: versionRecord.publishedAt,
        notes: versionRecord.notes,
        publishedFromWorkspaceId: versionRecord.publishedFromWorkspaceId,
        variants: versionRecord.providers
      },
      payloads: versionRecord.providers.map((variant) => ({
        provider: variant.provider,
        displayName: variant.displayName,
        files: collectFiles(path.join(this.baseDir, variant.payloadPath))
      }))
    };

    const packageJson = JSON.stringify(packageData, null, 2);
    const packageBase64 = Buffer.from(packageJson).toString("base64");
    const packagePath = `packages/${detail.skill.slug}/${version}.htyskillpkg`;
    const branchName = branch || "main";
    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    // 1. Upload package file
    const existingPkg = await fetch(`${apiBase}/contents/${packagePath}?ref=${branchName}`, { headers }).catch(() => null);
    const existingPkgData = existingPkg?.ok ? await existingPkg.json() : null;

    const putPkgBody = {
      message: `Upload ${detail.skill.name} ${version}`,
      content: packageBase64,
      branch: branchName
    };
    if (existingPkgData?.sha) {
      putPkgBody.sha = existingPkgData.sha;
    }

    const pkgResponse = await fetch(`${apiBase}/contents/${packagePath}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(putPkgBody)
    });
    if (!pkgResponse.ok) {
      const err = await pkgResponse.text();
      throw new Error(`Failed to upload package: ${pkgResponse.status} ${err}`);
    }

    // 2. Get current registry.json
    const registryPath = "registry.json";
    const existingReg = await fetch(`${apiBase}/contents/${registryPath}?ref=${branchName}`, { headers }).catch(() => null);
    const existingRegData = existingReg?.ok ? await existingReg.json() : null;

    let registry = { schemaVersion: 1, updatedAt: exportedAt, skills: [] };
    if (existingRegData?.content) {
      try {
        registry = JSON.parse(Buffer.from(existingRegData.content, "base64").toString("utf8"));
      } catch { /* start fresh */ }
    }

    // 3. Update registry entry
    const packageSize = Buffer.byteLength(packageJson, "utf8");
    const newMarketVersion = {
      version: versionRecord.version,
      publishedAt: versionRecord.publishedAt,
      notes: versionRecord.notes,
      providers: versionRecord.providers.map((p) => p.provider),
      packageUrl: packagePath,
      packageSize
    };

    let skillEntry = registry.skills.find((s) => s.skillId === skillId);
    if (!skillEntry) {
      skillEntry = {
        skillId: detail.skill.skillId,
        slug: detail.skill.slug,
        name: detail.skill.name,
        description: detail.skill.description,
        author: request.author || "unknown",
        tags: detail.skill.tags,
        latestVersion: version,
        latestProviders: versionRecord.providers.map((p) => p.provider),
        versionCount: 0,
        createdAt: detail.skill.createdAt,
        updatedAt: exportedAt,
        downloadCount: 0,
        versions: []
      };
      registry.skills.unshift(skillEntry);
    }

    const existingVersionIndex = skillEntry.versions.findIndex((v) => v.version === version);
    if (existingVersionIndex >= 0) {
      skillEntry.versions[existingVersionIndex] = newMarketVersion;
    } else {
      skillEntry.versions.unshift(newMarketVersion);
    }
    skillEntry.latestVersion = skillEntry.versions[0]?.version || version;
    skillEntry.latestProviders = skillEntry.versions[0]?.providers || [];
    skillEntry.versionCount = skillEntry.versions.length;
    skillEntry.updatedAt = exportedAt;
    skillEntry.name = detail.skill.name;
    skillEntry.description = detail.skill.description;
    skillEntry.tags = detail.skill.tags;
    registry.updatedAt = exportedAt;

    // 4. Upload updated registry.json
    const registryBase64 = Buffer.from(JSON.stringify(registry, null, 2)).toString("base64");
    const putRegBody = {
      message: `Update registry: ${detail.skill.name} ${version}`,
      content: registryBase64,
      branch: branchName
    };
    if (existingRegData?.sha) {
      putRegBody.sha = existingRegData.sha;
    }

    const regResponse = await fetch(`${apiBase}/contents/${registryPath}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(putRegBody)
    });
    if (!regResponse.ok) {
      const err = await regResponse.text();
      throw new Error(`Failed to update registry: ${regResponse.status} ${err}`);
    }

    // 5. Record activity
    const data = this.loadLibrary();
    appendActivityRecord(
      data,
      "market_upload",
      `上传 ${detail.skill.name} ${version} 到云端市场`,
      `已推送到 ${owner}/${repo}`
    );
    this.saveLibrary(data);

    return { message: `Successfully uploaded ${detail.skill.name} ${version}` };
  }

  getLibraryDetailRecord(skillId) {
    const data = this.loadLibrary();
    const detail = data.skills.find((item) => item.skill.skillId === skillId);
    if (!detail) {
      throw new Error(`skill not found: ${skillId}`);
    }
    return detail;
  }

  ensureVariantPayloadDir(variant) {
    const targetDir = path.join(this.baseDir, variant.payloadPath);
    if (!fs.existsSync(targetDir)) {
      throw new Error(`variant payload missing: ${normalizePath(targetDir)}`);
    }
    return targetDir;
  }

  resolveWorkspaceContext(workspaceRoot) {
    if (workspaceRoot === SPECIAL_WORKSPACE_ROOT) {
      return { kind: "special" };
    }

    const rootPath = path.resolve(workspaceRoot);
    if (!fs.existsSync(rootPath)) {
      throw new Error(`workspace does not exist: ${workspaceRoot}`);
    }

    return { kind: "standard", rootPath };
  }

  workspaceRecordForContext(context, name) {
    if (context.kind === "special") {
      return this.specialWorkspaceRecord();
    }

    return this.upsertWorkspace(context.rootPath, name);
  }

  specialWorkspaceRecord() {
    return {
      workspaceId: SPECIAL_WORKSPACE_ID,
      name: SPECIAL_WORKSPACE_NAME,
      rootPath: SPECIAL_WORKSPACE_ROOT,
      createdAt: SPECIAL_WORKSPACE_CREATED_AT,
      kind: "special",
      availableProviders: this.specialAvailableProviders()
    };
  }

  specialAvailableProviders() {
    return PROVIDERS.filter((provider) => {
      const root = this.specialProviderRoot(provider);
      return root ? fs.existsSync(root) : false;
    });
  }

  specialProviderRoot(provider) {
    const home = homeDirForSpecialWorkspace();
    if (!home) {
      return null;
    }

    return path.join(home, specialGlobalRelativeFromHome(provider));
  }

  specialWorkspaceStorageRoot() {
    return path.join(this.baseDir, "special-workspaces", SPECIAL_WORKSPACE_STORAGE_NAME);
  }

  indexesDirForContext(context) {
    if (context.kind === "standard") {
      return path.join(context.rootPath, ".htyskillmanager", "instances");
    }

    return path.join(this.specialWorkspaceStorageRoot(), ".htyskillmanager", "instances");
  }

  scanProviderRoot(context, provider) {
    if (context.kind === "standard") {
      return path.join(context.rootPath, rootRelative(provider));
    }

    return this.specialProviderRoot(provider);
  }

  relativePathForContext(context, targetPath) {
    if (context.kind === "standard") {
      return normalizePath(path.relative(context.rootPath, targetPath));
    }

    return normalizePath(targetPath);
  }

  resolveInstanceSourceDir(context, index) {
    if (context.kind === "standard") {
      return path.join(context.rootPath, index.relativePath);
    }

    return path.resolve(index.relativePath);
  }

  displayIndexPath(context, indexPath) {
    if (context.kind === "standard") {
      return normalizePath(path.relative(context.rootPath, indexPath));
    }

    return normalizePath(indexPath);
  }

  installProviderRoot(context, provider) {
    if (context.kind === "standard") {
      return path.join(context.rootPath, rootRelative(provider));
    }

    const root = this.specialProviderRoot(provider);
    if (!root) {
      throw new Error(`无法解析 ${provider} 的全局路径`);
    }
    if (!fs.existsSync(root)) {
      throw new Error(`特殊工作区未发现 ${provider} 的全局路径：${normalizePath(root)}`);
    }
    return root;
  }

  backupTargetForContext(context, targetDir, provider) {
    if (context.kind === "standard") {
      const relativePath = normalizePath(path.relative(context.rootPath, targetDir));
      return this.backupExistingTarget(context.rootPath, relativePath);
    }

    const backupRoot = path.join(
      this.specialWorkspaceStorageRoot(),
      ".htyskillmanager",
      "backups",
      nowCompact(),
      provider,
      path.basename(targetDir) || "skill"
    );
    copyDir(targetDir, backupRoot);
    return normalizePath(backupRoot);
  }

  specialProviderFromTargetPath(target) {
    const normalizedTarget = normalizePath(target).toLowerCase();
    return PROVIDERS.find((provider) => {
      const root = this.specialProviderRoot(provider);
      return root ? normalizedTarget.startsWith(normalizePath(root).toLowerCase()) : false;
    }) ?? null;
  }

  upsertWorkspace(rootPath, name) {
    const data = this.loadLibrary();
    const rootAsString = normalizePath(rootPath);
    const existing = data.workspaces.find((workspace) => pathsMatch(workspace.rootPath, rootAsString));
    if (existing) {
      return existing;
    }

    const workspace = {
      workspaceId: randomUUID(),
      name: name || path.basename(rootPath) || normalizePath(rootPath),
      rootPath: rootAsString,
      createdAt: nowIso(),
      kind: "project",
      availableProviders: [...PROVIDERS]
    };
    data.workspaces.push(workspace);
    this.saveLibrary(data);
    return workspace;
  }

  ensureVersionExists(skillId, version) {
    const data = this.loadLibrary();
    const found = data.skills.some((skill) =>
      skill.skill.skillId === skillId && skill.versions.some((entry) => entry.version === version)
    );
    if (!found) {
      throw new Error(`version not found: ${skillId}@${version}`);
    }
  }

  ensureVersionNotExists(skillId, version) {
    const data = this.loadLibrary();
    const found = data.skills.some((skill) =>
      skill.skill.skillId === skillId && skill.versions.some((entry) => entry.version === version)
    );
    if (found) {
      throw new Error(`version already exists: ${skillId}@${version}`);
    }
  }

  loadIndexMap(indexesDir) {
    const indexes = new Map();
    if (!fs.existsSync(indexesDir)) {
      return indexes;
    }

    for (const name of fs.readdirSync(indexesDir)) {
      if (!name.endsWith(".htyVersion")) {
        continue;
      }

      const indexPath = path.join(indexesDir, name);
      const index = normalizeIndexRecord(JSON.parse(fs.readFileSync(indexPath, "utf8")));
      indexes.set(indexKey(index.provider, index.relativePath), { indexPath, index });
    }

    return indexes;
  }

  writeIndexFile(indexPath, index) {
    ensureDir(path.dirname(indexPath));
    fs.writeFileSync(indexPath, JSON.stringify(normalizeIndexRecord(index), null, 2), "utf8");
  }

  findIndexByInstanceId(indexesDir, instanceId) {
    if (!fs.existsSync(indexesDir)) {
      throw new Error(`instance not found: ${instanceId}`);
    }

    for (const name of fs.readdirSync(indexesDir)) {
      if (!name.endsWith(".htyVersion")) {
        continue;
      }

      const indexPath = path.join(indexesDir, name);
      const index = normalizeIndexRecord(JSON.parse(fs.readFileSync(indexPath, "utf8")));
      if (index.instanceId === instanceId) {
        return { indexPath, index };
      }
    }

    throw new Error(`instance not found: ${instanceId}`);
  }

  backupExistingTarget(workspaceRoot, relativePath) {
    const source = path.join(workspaceRoot, relativePath);
    if (!fs.existsSync(source)) {
      throw new Error(`target does not exist: ${normalizePath(source)}`);
    }

    const backupRelative = path.join(".htyskillmanager", "backups", nowCompact(), relativePath);
    const target = path.join(workspaceRoot, backupRelative);
    copyDir(source, target);
    return normalizePath(backupRelative);
  }
}

function ensureLibraryFile(filePath) {
  if (fs.existsSync(filePath)) {
    return;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        workspaces: [],
        skills: [],
        activities: []
      },
      null,
      2
    ),
    "utf8"
  );
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`source directory does not exist: ${normalizePath(source)}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
  copyDirRecursive(source, target);
}

function copyDirRecursive(source, target) {
  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function normalizePath(targetPath) {
  return targetPath.replaceAll("\\", "/");
}

function pathsMatch(left, right) {
  return normalizePath(path.resolve(left)).replace(/\/+$/, "").toLowerCase() ===
    normalizePath(path.resolve(right)).replace(/\/+$/, "").toLowerCase();
}

function rootRelative(provider) {
  switch (provider) {
    case "codex":
      return ".codex/skills";
    case "claude":
      return ".claude/skills";
    case "cursor":
      return ".cursor/skills";
    default:
      throw new Error(`unknown provider: ${provider}`);
  }
}

function specialGlobalRelativeFromHome(provider) {
  switch (provider) {
    case "codex":
      return ".codex/skills";
    case "claude":
      return ".claude/skills";
    case "cursor":
      return ".cursor/skills-cursor";
    default:
      throw new Error(`unknown provider: ${provider}`);
  }
}

function homeDirForSpecialWorkspace() {
  return process.env.HTY_SPECIAL_HOME || process.env.USERPROFILE || process.env.HOME || os.homedir();
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function nowCompact() {
  return nowIso().replaceAll("-", "").replaceAll(":", "").replace("T", "").replace("Z", "");
}

function localInstanceFromIndex(workspace, indexPath, index, skillIds) {
  let status = "unbound";
  if (index.linkedSkillId) {
    status = skillIds && skillIds.has(index.linkedSkillId) ? "bound" : "lost";
  }
  return {
    instanceId: index.instanceId,
    workspaceId: workspace.workspaceId,
    provider: index.provider,
    relativePath: index.relativePath,
    displayName: index.displayName,
    linkedSkillId: index.linkedSkillId,
    linkedVersion: index.linkedVersion,
    appliedSkillId: index.appliedSkillId,
    appliedVersion: index.appliedVersion,
    status,
    indexPath
  };
}

function normalizeIndexRecord(raw) {
  return {
    schemaVersion: 2,
    instanceId: raw.instanceId,
    workspaceRoot: raw.workspaceRoot,
    provider: raw.provider,
    relativePath: raw.relativePath,
    linkedSkillId: raw.linkedSkillId ?? null,
    linkedVersion: raw.linkedVersion ?? null,
    appliedSkillId: raw.appliedSkillId === undefined ? raw.linkedSkillId ?? null : raw.appliedSkillId,
    appliedVersion: raw.appliedVersion === undefined ? raw.linkedVersion ?? null : raw.appliedVersion,
    displayName: raw.displayName,
    createdAt: raw.createdAt
  };
}

function normalizePublishProviders(input) {
  if (!Array.isArray(input) || !input.length) {
    return [...PROVIDERS];
  }
  return input.filter((provider, index) => PROVIDERS.includes(provider) && input.indexOf(provider) === index);
}

function buildSkillSummary(detail) {
  const latestVersionRecord = sortVersions(detail.versions)[0] ?? null;
  return {
    skillId: detail.skill.skillId,
    slug: detail.skill.slug,
    name: detail.skill.name,
    description: detail.skill.description,
    tags: detail.skill.tags,
    latestVersion: latestVersionRecord?.version ?? null,
    latestProviders: latestVersionRecord?.providers.map((provider) => provider.provider) ?? [],
    versionCount: detail.versions.length,
    createdAt: detail.skill.createdAt
  };
}

function sortVersions(versions) {
  return [...versions].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function selectVersionVariant(version, preferredProvider) {
  return version.providers.find((item) => item.provider === preferredProvider) ?? version.providers[0] ?? null;
}

function uniqueSlug(skills, seed) {
  const baseSlug = slugify(seed);
  let slug = baseSlug;
  let counter = 1;

  while (skills.some((skill) => skill.skill.slug === slug)) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }

  return slug;
}

function slugify(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "skill";
}

function bumpPatchVersion(version) {
  const parts = version.split(".");
  if (parts.length !== 3) {
    throw new Error(`invalid semantic version: ${version}`);
  }

  const [major, minor, patch] = parts.map((value) => Number.parseInt(value, 10));
  if ([major, minor, patch].some((value) => Number.isNaN(value))) {
    throw new Error(`invalid semantic version: ${version}`);
  }

  return `${major}.${minor}.${patch + 1}`;
}

function sanitizeFileName(value) {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim();
  return sanitized || "skill";
}

function indexKey(provider, relativePath) {
  return `${provider}::${relativePath}`;
}

function appendActivityRecord(data, kind, title, detail) {
  data.activities.unshift({
    id: randomUUID(),
    kind,
    title,
    detail,
    createdAt: nowIso()
  });
  data.activities = data.activities.slice(0, 200);
}

function collectFiles(rootDir) {
  const files = [];
  if (!fs.existsSync(rootDir)) {
    return files;
  }

  walkFiles(rootDir, rootDir, files);
  return files;
}

function walkFiles(currentDir, rootDir, files) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolutePath, rootDir, files);
      continue;
    }

    const relativePath = normalizePath(path.relative(rootDir, absolutePath));
    files.push({
      path: relativePath,
      content: fs.readFileSync(absolutePath).toString("base64")
    });
  }
}

module.exports = {
  createDesktopService,
  SPECIAL_WORKSPACE_ROOT
};
