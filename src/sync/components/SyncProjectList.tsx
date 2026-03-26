import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import type { SyncProject } from "../lib/sync-types";
import { getDesktopBridge } from "../../lib/desktop";

interface Props {
  projects: SyncProject[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  onAdd: (name: string, projectPath: string) => void;
  onRemove: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onOpenFolder: (projectPath: string) => void;
}

export function SyncProjectList({ projects, selectedName, onSelect, onAdd, onRemove, onRename, onOpenFolder }: Props) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [adding, setAdding] = useState<{ path: string; defaultName: string } | null>(null);
  const [addName, setAddName] = useState("");

  const handleAdd = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const result = await bridge.openDialog({ directory: true, title: t("sync.selectProjectFolder") });
    if (!result || Array.isArray(result)) return;
    const dirPath = result;
    const parts = dirPath.replace(/\\/g, "/").split("/");
    const defaultName = parts[parts.length - 1] || "project";
    setAdding({ path: dirPath, defaultName });
    setAddName(defaultName);
  };

  const handleConfirmAdd = () => {
    if (adding && addName.trim()) {
      onAdd(addName.trim(), adding.path);
    }
    setAdding(null);
    setAddName("");
  };

  const handleCancelAdd = () => {
    setAdding(null);
    setAddName("");
  };

  const handleStartRename = (name: string) => {
    setRenaming(name);
    setRenameValue(name);
  };

  const handleConfirmRename = () => {
    if (renaming && renameValue.trim() && renameValue.trim() !== renaming) {
      onRename(renaming, renameValue.trim());
    }
    setRenaming(null);
  };

  return (
    <div className="sync-project-list">
      <div className="sync-project-list__header">
        <span className="sync-project-list__title">{t("sync.projects")}</span>
        <button className="sync-project-list__add-btn" onClick={handleAdd} title={t("common.add")}>
          <Plus size={14} />
        </button>
      </div>
      <div className="sync-project-list__items">
        {/* Inline add project input */}
        {adding && (
          <div className="sync-project-item sync-project-item--adding">
            <div className="sync-project-item__add-row">
              <input
                className="sync-project-item__rename"
                value={addName}
                autoFocus
                placeholder={t("sync.projectName")}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmAdd(); if (e.key === "Escape") handleCancelAdd(); }}
              />
              <button className="sync-project-item__confirm-btn" onClick={handleConfirmAdd} title={t("common.confirm")}>
                <Check size={13} />
              </button>
              <button className="sync-project-item__confirm-btn" onClick={handleCancelAdd} title={t("common.cancel")}>
                <X size={13} />
              </button>
            </div>
            <span className="sync-project-item__path">{adding.path}</span>
          </div>
        )}
        {projects.map((proj) => (
          <div
            key={proj.name}
            className={`sync-project-item${selectedName === proj.name ? " is-active" : ""}`}
            onClick={() => onSelect(proj.name)}
          >
            {renaming === proj.name ? (
              <input
                className="sync-project-item__rename"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleConfirmRename}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmRename(); if (e.key === "Escape") setRenaming(null); }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <div className="sync-project-item__info">
                  <span className="sync-project-item__name">{proj.name}</span>
                  <span className="sync-project-item__path">{proj.path}</span>
                </div>
                <div className="sync-project-item__actions">
                  <button onClick={(e) => { e.stopPropagation(); onOpenFolder(proj.path); }} title={t("sync.timelineOpenFolder")}>
                    <FolderOpen size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleStartRename(proj.name); }} title={t("common.name")}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onRemove(proj.name); }} title={t("common.delete")}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {projects.length === 0 && !adding && (
          <div className="sync-project-list__empty">{t("sync.noProjects")}</div>
        )}
      </div>
    </div>
  );
}
