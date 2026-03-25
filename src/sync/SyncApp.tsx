import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { syncApi } from "./lib/sync-api";
import { useSyncUiStore } from "./state/sync-ui-store";
import { SyncProjectList } from "./components/SyncProjectList";
import { SyncProjectPage } from "./pages/SyncProjectPage";
import { getDesktopBridge } from "../lib/desktop";

export function SyncApp() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const selectedProjectName = useSyncUiStore((s) => s.selectedProjectName);
  const setSelectedProjectName = useSyncUiStore((s) => s.setSelectedProjectName);

  const projectsQuery = useQuery({
    queryKey: ["sync-projects"],
    queryFn: syncApi.loadProjects
  });

  const data = projectsQuery.data;
  const projects = data?.Projects ?? [];
  const repoPath = data?.RepositoryPath ?? "";

  // Auto-select first project if none selected
  useEffect(() => {
    if (!projects.length) {
      if (selectedProjectName) setSelectedProjectName(null);
      return;
    }
    if (!selectedProjectName || !projects.some((p) => p.Name === selectedProjectName)) {
      setSelectedProjectName(projects[0].Name);
    }
  }, [projects, selectedProjectName, setSelectedProjectName]);

  const selectedProject = projects.find((p) => p.Name === selectedProjectName) ?? null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["sync-projects"] });

  const addProject = useMutation({
    mutationFn: ({ name, path }: { name: string; path: string }) => syncApi.addProject(name, path),
    onSuccess: invalidate
  });

  const removeProject = useMutation({
    mutationFn: (name: string) => syncApi.removeProject(name),
    onSuccess: invalidate
  });

  const renameProject = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) => syncApi.renameProject(oldName, newName),
    onSuccess: invalidate
  });

  const saveRepoPath = useMutation({
    mutationFn: async (newPath: string) => {
      const current = projectsQuery.data || { RepositoryPath: "", Projects: [] };
      await syncApi.saveProjects({ ...current, RepositoryPath: newPath });
    },
    onSuccess: invalidate
  });

  const handleSelectRepo = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const result = await bridge.openDialog({ directory: true, title: t("sync.selectRepoFolder") });
    if (!result || Array.isArray(result)) return;
    saveRepoPath.mutate(result);
  };

  return (
    <div className="sync-app">
      <div className="sync-sidebar">
        <div className="sync-sidebar__repo">
          <span className="sync-sidebar__repo-label">{t("sync.repository")}</span>
          <div className="sync-sidebar__repo-row">
            <span className="sync-sidebar__repo-path" title={repoPath}>{repoPath || t("sync.notSet")}</span>
            <button className="button button--ghost" onClick={handleSelectRepo}>
              <FolderOpen size={14} />
            </button>
          </div>
        </div>
        <SyncProjectList
          projects={projects.map((p) => ({ name: p.Name, path: p.Path }))}
          selectedName={selectedProjectName}
          onSelect={setSelectedProjectName}
          onAdd={(name, path) => addProject.mutate({ name, path })}
          onRemove={(name) => removeProject.mutate(name)}
          onRename={(oldName, newName) => renameProject.mutate({ oldName, newName })}
          onOpenFolder={(path) => syncApi.openInExplorer(path)}
        />
      </div>
      <div className="sync-main">
        {selectedProject && repoPath ? (
          <SyncProjectPage
            project={{ name: selectedProject.Name, path: selectedProject.Path }}
            repoPath={repoPath}
          />
        ) : (
          <div className="sync-main__empty">
            {!repoPath
              ? t("sync.noRepository")
              : t("sync.noProjectSelected")}
          </div>
        )}
      </div>
    </div>
  );
}
