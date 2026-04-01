import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "../components/layout/Sidebar";
import { TopBar } from "../components/layout/TopBar";
import { AppTabBar } from "../components/layout/AppTabBar";
import { UserProfileBar } from "../components/layout/UserProfileBar";
import { ConfirmDialog } from "../components/dialogs/ConfirmDialog";
import { confirm } from "../state/confirm-store";
import { InstallDialog } from "../components/dialogs/InstallDialog";
import { MergeConflictDialog } from "../components/dialogs/MergeConflictDialog";
import { PublishDialog } from "../components/dialogs/PublishDialog";
import { SettingsDialog } from "../components/dialogs/SettingsDialog";
import { SyncApp } from "../sync/SyncApp";
import { TasksApp } from "../tasks/TasksApp";
import { MarksApp } from "../marks/MarksApp";
import { MemosApp } from "../memos/MemosApp";
import { GameApp } from "../game/GameApp";

import { api } from "../lib/api";
import type { MergeSessionSummary } from "../lib/merge-types";
import { pickExportPackagePath, pickImportPackagePath, pickWorkspaceRoot } from "../lib/dialogs";
import type { LocalInstance } from "../lib/types";
import { UpdateDialog } from "../components/UpdateDialog";
import { CommandPalette } from "../components/shared/CommandPalette";
import { ToastContainer } from "../components/shared/ToastContainer";
import { toast } from "../state/toast-store";
import { useUiStore } from "../state/ui-store";
import { OverviewPage } from "../pages/OverviewPage";
import { GlobalLibraryPage } from "../pages/GlobalLibraryPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ActivityPage } from "../pages/ActivityPage";
import { MarketPage } from "../pages/MarketPage";
import { ComposerPage } from "../pages/ComposerPage";

export function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="app-root">
      <AppTabBar />
      <div className="app-root__body">
        {activeTab === "skill" ? <SkillApp /> : activeTab === "sync" ? <SyncApp /> : activeTab === "tasks" ? <TasksApp /> : activeTab === "marks" ? <MarksApp /> : activeTab === "memos" ? <MemosApp /> : <GameApp />}
      </div>
      <UserProfileBar onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <UpdateDialog />
      <ToastContainer />
      <ConfirmDialog />
      <CommandPalette />
    </div>
  );
}

function SkillApp() {
  const queryClient = useQueryClient();
  const {
    route,
    search,
    selectedSkillId,
    selectedWorkspaceId,
    publishOpen,
    installOpen,
    setRoute,
    setSearch,
    setSelectedSkillId,
    setSelectedWorkspaceId,
    openPublish,
    closePublish,
    openInstall,
    closeInstall
  } = useUiStore();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [mergeSession, setMergeSession] = useState<MergeSessionSummary | null>(null);

  const dashboardQuery = useQuery({ queryKey: ["dashboard"], queryFn: api.getDashboard });
  const libraryQuery = useQuery({ queryKey: ["library"], queryFn: api.listLibrary });
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: api.listWorkspaces });
  const activityQuery = useQuery({ queryKey: ["activity"], queryFn: () => api.listActivity() });

  const DEFAULT_REGISTRY_URL = "https://raw.githubusercontent.com/htyashes-crypto/hty-skill-market/main/registry.json";
  const marketQuery = useQuery({
    queryKey: ["market-registry"],
    queryFn: () => api.fetchMarketRegistry(DEFAULT_REGISTRY_URL),
    staleTime: 60 * 1000,
    enabled: route === "market"
  });

  const workspaceItems = workspacesQuery.data ?? [];
  const libraryItems = libraryQuery.data ?? [];
  const hasSelectedSkill = selectedSkillId
    ? libraryItems.some((skill) => skill.skillId === selectedSkillId)
    : false;

  const filteredLibrary = useMemo(() => {
    if (!search.trim()) {
      return libraryItems;
    }
    const needle = search.toLowerCase();
    return libraryItems.filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) ||
        skill.description.toLowerCase().includes(needle) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(needle))
    );
  }, [libraryItems, search]);

  const filteredWorkspaces = useMemo(() => {
    if (route === "projects") {
      return workspaceItems;
    }
    if (!search.trim()) {
      return workspaceItems;
    }
    const needle = search.toLowerCase();
    return workspaceItems.filter(
      (workspace) =>
        workspace.name.toLowerCase().includes(needle) ||
        workspace.rootPath.toLowerCase().includes(needle)
    );
  }, [route, search, workspaceItems]);

  useEffect(() => {
    if (!libraryItems.length) {
      if (selectedSkillId) {
        setSelectedSkillId(null);
      }
      return;
    }

    if (!selectedSkillId || !libraryItems.some((skill) => skill.skillId === selectedSkillId)) {
      setSelectedSkillId(libraryItems[0].skillId);
    }
  }, [libraryItems, selectedSkillId, setSelectedSkillId]);

  useEffect(() => {
    if (!workspaceItems.length) {
      if (selectedWorkspaceId) {
        setSelectedWorkspaceId(null);
      }
      return;
    }

    if (!selectedWorkspaceId || !workspaceItems.some((workspace) => workspace.workspaceId === selectedWorkspaceId)) {
      setSelectedWorkspaceId(workspaceItems[0].workspaceId);
    }
  }, [workspaceItems, selectedWorkspaceId, setSelectedWorkspaceId]);

  const selectedWorkspace = workspaceItems.find((item) => item.workspaceId === selectedWorkspaceId) ?? null;

  const workspaceSnapshotQuery = useQuery({
    queryKey: ["workspace", selectedWorkspace?.rootPath],
    enabled: Boolean(selectedWorkspace),
    queryFn: () => api.watchWorkspace(selectedWorkspace!.rootPath, selectedWorkspace!.name),
    refetchInterval: route === "projects" && selectedWorkspace ? 5000 : false,
    refetchIntervalInBackground: true
  });

  useEffect(() => {
    const instances = workspaceSnapshotQuery.data?.instances ?? [];
    if (!instances.length) {
      if (selectedInstanceId) {
        setSelectedInstanceId(null);
      }
      return;
    }

    const matched = selectedInstanceId
      ? instances.find((instance) => instance.instanceId === selectedInstanceId)
      : null;

    if (!matched) {
      setSelectedInstanceId(instances[0].instanceId);
    }
  }, [selectedInstanceId, workspaceSnapshotQuery.data]);

  const selectedSkillDetailQuery = useQuery({
    queryKey: ["skill", selectedSkillId],
    enabled: Boolean(selectedSkillId && hasSelectedSkill),
    queryFn: () => api.getSkillDetail(selectedSkillId!)
  });

  const selectedInstance = useMemo(() => {
    const instances = workspaceSnapshotQuery.data?.instances ?? [];
    return instances.find((item) => item.instanceId === selectedInstanceId) ?? null;
  }, [selectedInstanceId, workspaceSnapshotQuery.data]);

  const bindMutation = useMutation({
    mutationFn: async ({ skillId }: { skillId: string }) => {
      if (!selectedWorkspace || !selectedInstance) {
        return null;
      }
      return api.bindLocalInstance({
        workspaceRoot: selectedWorkspace.rootPath,
        instanceId: selectedInstance.instanceId,
        skillId
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace", selectedWorkspace?.rootPath] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    }
  });

  const invalidateCoreQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["library"] }),
      queryClient.invalidateQueries({ queryKey: ["activity"] }),
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["app-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace", selectedWorkspace?.rootPath] }),
      queryClient.invalidateQueries({ queryKey: ["skill", selectedSkillId] })
    ]);
  };

  const handleSelectInstance = (instance: LocalInstance) => {
    setSelectedInstanceId(instance.instanceId);
    if (instance.linkedSkillId) {
      setSelectedSkillId(instance.linkedSkillId);
    }
  };

  const handleAddWorkspace = async () => {
    const workspaceRoot = await pickWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }
    try {
      const snapshot = await api.scanWorkspace(workspaceRoot);
      setSelectedWorkspaceId(snapshot.workspace.workspaceId);
      setRoute("projects");
      await invalidateCoreQueries();
      toast("success", `\u5de5\u4f5c\u533a\u5df2\u6dfb\u52a0\uff0c\u53d1\u73b0 ${snapshot.instances.length} \u4e2a\u5b9e\u4f8b`);
    } catch (err: unknown) {
      toast("error", `\u6dfb\u52a0\u5de5\u4f5c\u533a\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRefreshWorkspace = async () => {
    if (!selectedWorkspace) {
      return;
    }
    await workspaceSnapshotQuery.refetch();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    ]);
  };

  const handleScanWorkspace = async () => {
    if (!selectedWorkspace) {
      return;
    }
    await api.scanWorkspace(selectedWorkspace.rootPath, selectedWorkspace.name);
    await invalidateCoreQueries();
  };

  const handleOpenMergeSession = (session: MergeSessionSummary) => {
    setMergeSession(session);
  };

  const handleCloseMergeSession = async () => {
    if (!mergeSession) {
      return;
    }

    try {
      await api.discardMergeSession(mergeSession.sessionId);
    } catch {
      // ignore already-discarded sessions
    } finally {
      setMergeSession(null);
    }
  };

  const handleMergeCommitted = async () => {
    setMergeSession(null);
    await invalidateCoreQueries();
  };

  const handleUpdateBoundInstance = async (instanceId: string) => {
    if (!selectedWorkspace) {
      return;
    }

    try {
      const { autoApprove } = useUiStore.getState();

      const preview = await api.prepareUpdateMerge({
        workspaceRoot: selectedWorkspace.rootPath,
        instanceId,
        force: !autoApprove
      });

      if (preview.action === "noop") {
        toast("info", preview.message || "\u5df2\u662f\u6700\u65b0\u7248\u672c");
        return preview.message;
      }

      if (preview.action === "needs_resolution" || !autoApprove) {
        setMergeSession(preview);
        return;
      }

      const response = await api.commitMergeSession({ sessionId: preview.sessionId });
      await invalidateCoreQueries();
      toast("success", response.message || "\u66f4\u65b0\u6210\u529f");
      return response.message;
    } catch (err: unknown) {
      toast("error", `\u66f4\u65b0\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRollbackInstance = async (instanceId: string, targetVersion: string) => {
    if (!selectedWorkspace) {
      return;
    }

    try {
      const { autoApprove } = useUiStore.getState();

      const preview = await api.prepareUpdateMerge({
        workspaceRoot: selectedWorkspace.rootPath,
        instanceId,
        targetVersion,
        force: !autoApprove
      });

      if (preview.action === "noop") {
        toast("info", preview.message || "\u5df2\u662f\u76ee\u6807\u7248\u672c");
        return preview.message;
      }

      if (preview.action === "needs_resolution" || !autoApprove) {
        setMergeSession(preview);
        return;
      }

      const response = await api.commitMergeSession({ sessionId: preview.sessionId });
      await invalidateCoreQueries();
      toast("success", response.message || "\u56de\u6eda\u6210\u529f");
      return response.message;
    } catch (err: unknown) {
      toast("error", `\u56de\u6eda\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleImportPackage = async () => {
    const packagePath = await pickImportPackagePath();
    if (!packagePath) {
      return;
    }
    try {
      const result = await api.importPackage({ packagePath });
      await invalidateCoreQueries();
      toast("success", result.message || "\u5305\u5bfc\u5165\u6210\u529f");
    } catch (err: unknown) {
      toast("error", `\u5bfc\u5165\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportPackage = async () => {
    const detail = selectedSkillDetailQuery.data;
    const latestVersion = detail?.versions[0];
    if (!detail || !latestVersion) {
      return;
    }
    const outputPath = await pickExportPackagePath(
      `${detail.skill.name}-${latestVersion.version}.htyskillpkg`
    );
    if (!outputPath) {
      return;
    }
    try {
      await api.exportPackage({
        skillId: detail.skill.skillId,
        version: latestVersion.version,
        outputPath
      });
      await invalidateCoreQueries();
      toast("success", `\u5df2\u5bfc\u51fa ${detail.skill.name} v${latestVersion.version}`);
    } catch (err: unknown) {
      toast("error", `\u5bfc\u51fa\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const settingsQuery = useQuery({ queryKey: ["app-settings"], queryFn: api.getAppSettings });

  const handleEditInComposer = async () => {
    const detail = selectedSkillDetailQuery.data;
    const settings = settingsQuery.data;
    if (!detail || !settings) return;
    const latestVersion = detail.versions[0];
    const firstProvider = latestVersion?.providers[0];
    if (!firstProvider) return;
    const fullPath = `${settings.libraryRoot}/${firstProvider.payloadPath}`;
    useUiStore.getState().openComposer(fullPath, detail.skill.skillId);
  };

  const handleDeleteSkill = async () => {
    if (!selectedSkillId) return;
    const skill = libraryItems.find((s) => s.skillId === selectedSkillId);
    if (!skill) return;
    const ok = await confirm("\u5220\u9664\u6280\u80fd", `\u786e\u8ba4\u5220\u9664 "${skill.name}" \u53ca\u5176\u6240\u6709\u7248\u672c\uff1f\u6b64\u64cd\u4f5c\u4e0d\u53ef\u64a4\u9500\u3002`, true);
    if (!ok) return;
    try {
      await api.deleteSkill(selectedSkillId);
      setSelectedSkillId(null);
      await invalidateCoreQueries();
      toast("success", `\u5df2\u5220\u9664 "${skill.name}"`);
    } catch (err: unknown) {
      toast("error", `\u5220\u9664\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const content = (() => {
    switch (route) {
      case "overview":
        return (
          <OverviewPage
            dashboard={dashboardQuery.data}
            library={filteredLibrary}
            workspaces={filteredWorkspaces}
          />
        );
      case "library":
        return (
          <GlobalLibraryPage
            skills={filteredLibrary}
            selectedSkillId={selectedSkillId}
            onSelectSkill={setSelectedSkillId}
            detail={selectedSkillDetailQuery.data ?? null}
            onExport={handleExportPackage}
            onDelete={handleDeleteSkill}
            onEdit={handleEditInComposer}
          />
        );
      case "projects":
        return (
          <ProjectsPage
            search={search}
            workspaces={workspaceItems}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={setSelectedWorkspaceId}
            snapshot={workspaceSnapshotQuery.data ?? null}
            selectedInstance={selectedInstance}
            onSelectInstance={handleSelectInstance}
            onOpenPublish={() => openPublish(selectedInstance?.instanceId ?? null)}
            onOpenInstall={openInstall}
            onScanWorkspace={handleScanWorkspace}
            onRefreshWorkspace={handleRefreshWorkspace}
            library={filteredLibrary}
            selectedSkillId={selectedSkillId}
            onSelectSkillId={setSelectedSkillId}
            selectedSkillDetail={selectedSkillDetailQuery.data ?? null}
            onBind={(skillId) => bindMutation.mutateAsync({ skillId }).then(() => undefined)}
            onUpdateBoundInstance={handleUpdateBoundInstance}
            onRollbackInstance={handleRollbackInstance}
          />
        );
      case "activity":
        return <ActivityPage activities={activityQuery.data ?? []} />;
      case "market":
        return (
          <MarketPage
            registry={marketQuery.data ?? null}
            isLoading={marketQuery.isLoading}
            error={marketQuery.error}
            onRefresh={async () => {
              await queryClient.invalidateQueries({ queryKey: ["market-registry"] });
            }}
            localLibrary={libraryItems}
            onDownloadSuccess={invalidateCoreQueries}
          />
        );
      case "composer":
        return <ComposerPage workspaces={workspaceItems} />;
    }
  })();

  return (
    <div className="app-shell">
      <Sidebar
        route={route}
        search={search}
        onSearchChange={setSearch}
        workspaces={workspaceItems}
        selectedWorkspaceId={selectedWorkspaceId}
        currentWorkspaceInstanceCount={workspaceSnapshotQuery.data?.instances.length ?? 0}
        onRouteChange={setRoute}
        onSelectWorkspace={setSelectedWorkspaceId}
      />
      <main className="main-shell">
        {route !== "projects" && route !== "market" && route !== "composer" ? (
          <TopBar
            search={search}
            onSearchChange={setSearch}
            onAddWorkspace={handleAddWorkspace}
            onImportPackage={handleImportPackage}
          />
        ) : null}
        <div className="main-shell__content">{content}</div>
      </main>

      <PublishDialog
        open={publishOpen}
        instance={selectedInstance}
        workspaceRoot={selectedWorkspace?.rootPath ?? null}
        library={libraryQuery.data ?? []}
        onClose={closePublish}
        onSuccess={invalidateCoreQueries}
        onOpenMergeSession={handleOpenMergeSession}
      />
      <InstallDialog
        open={installOpen}
        library={libraryQuery.data ?? []}
        initialSkillId={selectedSkillId}
        workspace={selectedWorkspace}
        onClose={closeInstall}
        onSuccess={invalidateCoreQueries}
      />
      <MergeConflictDialog
        open={Boolean(mergeSession)}
        session={mergeSession}
        onClose={handleCloseMergeSession}
        onCommitted={handleMergeCommitted}
      />
    </div>
  );
}
