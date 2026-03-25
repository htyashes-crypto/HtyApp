import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "../components/layout/Sidebar";
import { TopBar } from "../components/layout/TopBar";
import { AppTabBar } from "../components/layout/AppTabBar";
import { UserProfileBar } from "../components/layout/UserProfileBar";
import { InstallDialog } from "../components/dialogs/InstallDialog";
import { MergeConflictDialog } from "../components/dialogs/MergeConflictDialog";
import { PublishDialog } from "../components/dialogs/PublishDialog";
import { SettingsDialog } from "../components/dialogs/SettingsDialog";
import { SyncApp } from "../sync/SyncApp";
import { api } from "../lib/api";
import type { MergeSessionSummary } from "../lib/merge-types";
import { pickExportPackagePath, pickImportPackagePath, pickWorkspaceRoot } from "../lib/dialogs";
import type { LocalInstance } from "../lib/types";
import { useUiStore } from "../state/ui-store";
import { OverviewPage } from "../pages/OverviewPage";
import { GlobalLibraryPage } from "../pages/GlobalLibraryPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ActivityPage } from "../pages/ActivityPage";

export function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="app-root">
      <AppTabBar />
      <div className="app-root__body">
        {activeTab === "skill" ? <SkillApp /> : <SyncApp />}
      </div>
      <UserProfileBar onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
  const activityQuery = useQuery({ queryKey: ["activity"], queryFn: api.listActivity });

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
    mutationFn: async ({ skillId, version }: { skillId: string; version: string }) => {
      if (!selectedWorkspace || !selectedInstance) {
        return null;
      }
      return api.bindLocalInstance({
        workspaceRoot: selectedWorkspace.rootPath,
        instanceId: selectedInstance.instanceId,
        skillId,
        version
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
    const snapshot = await api.scanWorkspace(workspaceRoot);
    setSelectedWorkspaceId(snapshot.workspace.workspaceId);
    setRoute("projects");
    await invalidateCoreQueries();
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

    const { autoApprove } = useUiStore.getState();

    const preview = await api.prepareUpdateMerge({
      workspaceRoot: selectedWorkspace.rootPath,
      instanceId,
      force: !autoApprove
    });

    if (preview.action === "noop") {
      return preview.message;
    }

    if (preview.action === "needs_resolution" || !autoApprove) {
      setMergeSession(preview);
      return;
    }

    const response = await api.commitMergeSession({ sessionId: preview.sessionId });
    await invalidateCoreQueries();
    return response.message;
  };

  const handleImportPackage = async () => {
    const packagePath = await pickImportPackagePath();
    if (!packagePath) {
      return;
    }
    await api.importPackage({ packagePath });
    await invalidateCoreQueries();
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
    await api.exportPackage({
      skillId: detail.skill.skillId,
      version: latestVersion.version,
      outputPath
    });
    await invalidateCoreQueries();
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
            onBind={(skillId, version) => bindMutation.mutateAsync({ skillId, version }).then(() => undefined)}
            onUpdateBoundInstance={handleUpdateBoundInstance}
          />
        );
      case "activity":
        return <ActivityPage activities={activityQuery.data ?? []} />;
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
        {route !== "projects" ? (
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
