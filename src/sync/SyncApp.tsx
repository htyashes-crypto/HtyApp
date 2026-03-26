import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncApi } from "./lib/sync-api";
import { useSyncUiStore } from "./state/sync-ui-store";
import { SyncRepoTree } from "./components/SyncRepoTree";
import { SyncProjectPage } from "./pages/SyncProjectPage";

export function SyncApp() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const selectedRepoId = useSyncUiStore((s) => s.selectedRepoId);
  const setSelectedRepoId = useSyncUiStore((s) => s.setSelectedRepoId);
  const selectedProjectName = useSyncUiStore((s) => s.selectedProjectName);
  const setSelectedProjectName = useSyncUiStore((s) => s.setSelectedProjectName);

  // Expanded repos (independent from selection)
  const [expandedRepoIds, setExpandedRepoIds] = useState<Set<string>>(
    () => new Set(selectedRepoId ? [selectedRepoId] : [])
  );

  const projectsQuery = useQuery({
    queryKey: ["sync-projects"],
    queryFn: syncApi.loadProjects
  });

  const data = projectsQuery.data;
  const repositories = data?.Repositories ?? [];

  // Auto-select repo and project
  useEffect(() => {
    if (!repositories.length) {
      if (selectedRepoId) setSelectedRepoId(null);
      if (selectedProjectName) setSelectedProjectName(null);
      return;
    }
    // If no repo selected or selected repo doesn't exist, select first
    const currentRepo = repositories.find((r) => r.Id === selectedRepoId);
    if (!currentRepo) {
      const firstRepo = repositories[0];
      setSelectedRepoId(firstRepo.Id);
      setExpandedRepoIds((prev) => new Set(prev).add(firstRepo.Id));
      const firstProjects = firstRepo.Projects;
      setSelectedProjectName(firstProjects.length ? firstProjects[0].Name : null);
      return;
    }
    // If selected project doesn't exist in current repo, select first
    if (!selectedProjectName || !currentRepo.Projects.some((p) => p.Name === selectedProjectName)) {
      setSelectedProjectName(currentRepo.Projects.length ? currentRepo.Projects[0].Name : null);
    }
  }, [repositories, selectedRepoId, selectedProjectName, setSelectedRepoId, setSelectedProjectName]);

  const selectedRepo = repositories.find((r) => r.Id === selectedRepoId) ?? null;
  const selectedProject = selectedRepo?.Projects.find((p) => p.Name === selectedProjectName) ?? null;
  const repoPath = selectedRepo?.RepositoryPath ?? "";

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["sync-projects"] });

  // Repository mutations
  const addRepository = useMutation({
    mutationFn: ({ name, repoPath }: { name: string; repoPath: string }) => syncApi.addRepository(name, repoPath),
    onSuccess: async (result) => {
      await invalidate();
      // Auto-select and expand the newly added repo
      if (result?.id) {
        setSelectedRepoId(result.id);
        setExpandedRepoIds((prev) => new Set(prev).add(result.id));
        setSelectedProjectName(null);
      }
    }
  });
  const removeRepository = useMutation({
    mutationFn: (repoId: string) => syncApi.removeRepository(repoId),
    onSuccess: () => {
      invalidate();
    }
  });
  const renameRepository = useMutation({
    mutationFn: ({ repoId, newName }: { repoId: string; newName: string }) => syncApi.renameRepository(repoId, newName),
    onSuccess: invalidate
  });
  const setRepositoryPath = useMutation({
    mutationFn: ({ repoId, repoPath }: { repoId: string; repoPath: string }) => syncApi.setRepositoryPath(repoId, repoPath),
    onSuccess: invalidate
  });

  // Project mutations (scoped to repo)
  const addProject = useMutation({
    mutationFn: ({ repoId, name, path }: { repoId: string; name: string; path: string }) => syncApi.addProject(repoId, name, path),
    onSuccess: invalidate
  });
  const removeProject = useMutation({
    mutationFn: ({ repoId, name }: { repoId: string; name: string }) => syncApi.removeProject(repoId, name),
    onSuccess: invalidate
  });
  const renameProject = useMutation({
    mutationFn: ({ repoId, oldName, newName }: { repoId: string; oldName: string; newName: string }) => syncApi.renameProject(repoId, oldName, newName),
    onSuccess: invalidate
  });

  const toggleExpandRepo = useCallback((repoId: string) => {
    setExpandedRepoIds((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  }, []);

  const handleSelectRepo = useCallback((repoId: string) => {
    toggleExpandRepo(repoId);
  }, [toggleExpandRepo]);

  const handleSelectProject = useCallback((repoId: string, projectName: string) => {
    if (repoId !== selectedRepoId) {
      setSelectedRepoId(repoId);
    }
    setSelectedProjectName(projectName);
  }, [selectedRepoId, setSelectedRepoId, setSelectedProjectName]);

  return (
    <div className="sync-app">
      <div className="sync-sidebar">
        <SyncRepoTree
          repositories={repositories}
          expandedRepoIds={expandedRepoIds}
          selectedRepoId={selectedRepoId}
          selectedProjectName={selectedProjectName}
          onSelectRepo={handleSelectRepo}
          onSelectProject={handleSelectProject}
          onAddRepo={(name, path) => addRepository.mutate({ name, repoPath: path })}
          onRemoveRepo={(repoId) => removeRepository.mutate(repoId)}
          onRenameRepo={(repoId, newName) => renameRepository.mutate({ repoId, newName })}
          onChangeRepoPath={(repoId, newPath) => setRepositoryPath.mutate({ repoId, repoPath: newPath })}
          onAddProject={(repoId, name, path) => addProject.mutate({ repoId, name, path })}
          onRemoveProject={(repoId, name) => removeProject.mutate({ repoId, name })}
          onRenameProject={(repoId, oldName, newName) => renameProject.mutate({ repoId, oldName, newName })}
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
            {!repositories.length
              ? t("sync.noRepositories")
              : !repoPath
                ? t("sync.noRepository")
                : t("sync.noProjectSelected")}
          </div>
        )}
      </div>
    </div>
  );
}
