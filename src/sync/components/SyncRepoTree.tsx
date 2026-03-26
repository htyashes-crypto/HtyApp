import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, FolderOpen, Plus, Trash2, Pencil, GitBranch, Check, X } from "lucide-react";
import type { SyncRepository } from "../lib/sync-types";
import { SyncProjectList } from "./SyncProjectList";
import { getDesktopBridge } from "../../lib/desktop";

interface Props {
  repositories: SyncRepository[];
  expandedRepoIds: Set<string>;
  selectedRepoId: string | null;
  selectedProjectName: string | null;
  onSelectRepo: (repoId: string) => void;
  onSelectProject: (repoId: string, projectName: string) => void;
  onAddRepo: (name: string, repoPath: string) => void;
  onRemoveRepo: (repoId: string) => void;
  onRenameRepo: (repoId: string, newName: string) => void;
  onChangeRepoPath: (repoId: string, newPath: string) => void;
  onAddProject: (repoId: string, name: string, projectPath: string) => void;
  onRemoveProject: (repoId: string, name: string) => void;
  onRenameProject: (repoId: string, oldName: string, newName: string) => void;
  onOpenFolder: (path: string) => void;
}

export function SyncRepoTree({
  repositories,
  expandedRepoIds,
  selectedRepoId,
  selectedProjectName,
  onSelectRepo,
  onSelectProject,
  onAddRepo,
  onRemoveRepo,
  onRenameRepo,
  onChangeRepoPath,
  onAddProject,
  onRemoveProject,
  onRenameProject,
  onOpenFolder
}: Props) {
  const { t } = useTranslation();
  const [renamingRepoId, setRenamingRepoId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Inline add state: holds the pending folder path while user types a name
  const [addingRepo, setAddingRepo] = useState<{ path: string; defaultName: string } | null>(null);
  const [addName, setAddName] = useState("");

  const handleAddRepo = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const result = await bridge.openDialog({ directory: true, title: t("sync.selectRepoFolder") });
    if (!result || Array.isArray(result)) return;
    const parts = result.replace(/\\/g, "/").split("/");
    const defaultName = parts[parts.length - 1] || "Repository";
    setAddingRepo({ path: result, defaultName });
    setAddName(defaultName);
  };

  const handleConfirmAdd = () => {
    if (addingRepo && addName.trim()) {
      onAddRepo(addName.trim(), addingRepo.path);
    }
    setAddingRepo(null);
    setAddName("");
  };

  const handleCancelAdd = () => {
    setAddingRepo(null);
    setAddName("");
  };

  const handleChangeRepoPath = async (repoId: string) => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const result = await bridge.openDialog({ directory: true, title: t("sync.selectRepoFolder") });
    if (!result || Array.isArray(result)) return;
    onChangeRepoPath(repoId, result);
  };

  const handleStartRenameRepo = (repo: SyncRepository) => {
    setRenamingRepoId(repo.Id);
    setRenameValue(repo.Name);
  };

  const handleConfirmRenameRepo = () => {
    if (renamingRepoId && renameValue.trim()) {
      onRenameRepo(renamingRepoId, renameValue.trim());
    }
    setRenamingRepoId(null);
  };

  return (
    <div className="sync-repo-tree">
      <div className="sync-repo-tree__header">
        <span className="sync-repo-tree__title">{t("sync.repositories")}</span>
        <button className="sync-repo-tree__add-btn" onClick={handleAddRepo} title={t("sync.addRepository")}>
          <Plus size={14} />
        </button>
      </div>

      {/* Inline add repo input */}
      {addingRepo && (
        <div className="sync-repo-group sync-repo-group--adding">
          <div className="sync-repo-group__add-row">
            <GitBranch size={14} className="sync-repo-group__icon" />
            <input
              className="sync-repo-group__rename"
              value={addName}
              autoFocus
              placeholder={t("sync.repositoryName")}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirmAdd(); if (e.key === "Escape") handleCancelAdd(); }}
            />
            <button className="sync-repo-group__confirm-btn" onClick={handleConfirmAdd} title={t("common.confirm")}>
              <Check size={14} />
            </button>
            <button className="sync-repo-group__confirm-btn" onClick={handleCancelAdd} title={t("common.cancel")}>
              <X size={14} />
            </button>
          </div>
          <div className="sync-repo-group__path" style={{ padding: "0 10px 8px" }} title={addingRepo.path}>
            {addingRepo.path}
          </div>
        </div>
      )}

      <div className="sync-repo-tree__list">
        {repositories.map((repo) => {
          const isExpanded = expandedRepoIds.has(repo.Id);
          const isSelected = repo.Id === selectedRepoId;
          return (
            <div key={repo.Id} className={`sync-repo-group${isExpanded ? " is-expanded" : ""}${isSelected ? " is-selected" : ""}`}>
              <div
                className="sync-repo-group__header"
                onClick={() => onSelectRepo(repo.Id)}
              >
                <span className="sync-repo-group__chevron">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <GitBranch size={14} className="sync-repo-group__icon" />
                {renamingRepoId === repo.Id ? (
                  <input
                    className="sync-repo-group__rename"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleConfirmRenameRepo}
                    onKeyDown={(e) => { if (e.key === "Enter") handleConfirmRenameRepo(); if (e.key === "Escape") setRenamingRepoId(null); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="sync-repo-group__name" title={repo.Name}>{repo.Name}</span>
                )}
                <div className="sync-repo-group__actions">
                  <button onClick={(e) => { e.stopPropagation(); handleChangeRepoPath(repo.Id); }} title={t("sync.selectRepoFolder")}>
                    <FolderOpen size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleStartRenameRepo(repo); }} title={t("common.name")}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onRemoveRepo(repo.Id); }} title={t("common.delete")}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="sync-repo-group__body">
                  <div className="sync-repo-group__path" title={repo.RepositoryPath}>
                    {repo.RepositoryPath || t("sync.notSet")}
                  </div>
                  <SyncProjectList
                    projects={repo.Projects.map((p) => ({ name: p.Name, path: p.Path }))}
                    selectedName={isSelected ? selectedProjectName : null}
                    onSelect={(name) => onSelectProject(repo.Id, name)}
                    onAdd={(name, path) => onAddProject(repo.Id, name, path)}
                    onRemove={(name) => onRemoveProject(repo.Id, name)}
                    onRename={(oldName, newName) => onRenameProject(repo.Id, oldName, newName)}
                    onOpenFolder={onOpenFolder}
                  />
                </div>
              )}
            </div>
          );
        })}
        {repositories.length === 0 && !addingRepo && (
          <div className="sync-repo-tree__empty">{t("sync.noRepositories")}</div>
        )}
      </div>
    </div>
  );
}
