import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Bookmark, ClipboardCopy, ExternalLink, File, Folder, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { WorkspaceRecord } from "../lib/types";
import { marksApi } from "../tools-shared/tools-api";
import type { BookmarkItem } from "../tools-shared/tools-types";
import { getDesktopBridge } from "../lib/desktop";

export function MarksApp() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: api.listWorkspaces });
  const workspaces = (workspacesQuery.data ?? []).filter((w) => w.kind === "project");
  const selectedWorkspace = workspaces.find((w) => w.workspaceId === selectedWorkspaceId) ?? null;

  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].workspaceId);
    }
  }, [selectedWorkspaceId, workspaces]);

  const bookmarksQuery = useQuery({
    queryKey: ["marks", selectedWorkspaceId],
    queryFn: () => marksApi.list(selectedWorkspaceId!),
    enabled: Boolean(selectedWorkspaceId)
  });

  const items = bookmarksQuery.data ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["marks", selectedWorkspaceId] });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspace) return;
      const bridge = getDesktopBridge();
      if (!bridge) return;
      const result = await bridge.openDialog({ title: t("marks.pickPath"), directory: false, multiple: true });
      if (!result) {
        // Try directory
        const dirResult = await bridge.openDialog({ title: t("marks.pickPath"), directory: true });
        if (!dirResult) return;
        const dirPath = Array.isArray(dirResult) ? dirResult[0] : dirResult;
        return marksApi.add(selectedWorkspace.workspaceId, selectedWorkspace.rootPath, dirPath);
      }
      const paths = Array.isArray(result) ? result : [result];
      for (const p of paths) {
        await marksApi.add(selectedWorkspace.workspaceId, selectedWorkspace.rootPath, p);
      }
    },
    onSuccess: invalidate
  });

  const addDirMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspace) return;
      const bridge = getDesktopBridge();
      if (!bridge) return;
      const result = await bridge.openDialog({ title: t("marks.pickDir"), directory: true });
      if (!result) return;
      const dirPath = Array.isArray(result) ? result[0] : result;
      return marksApi.add(selectedWorkspace.workspaceId, selectedWorkspace.rootPath, dirPath);
    },
    onSuccess: invalidate
  });

  const addFileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspace) return;
      const bridge = getDesktopBridge();
      if (!bridge) return;
      const result = await bridge.openDialog({ title: t("marks.pickFile"), directory: false, multiple: true });
      if (!result) return;
      const paths = Array.isArray(result) ? result : [result];
      for (const p of paths) {
        await marksApi.add(selectedWorkspace.workspaceId, selectedWorkspace.rootPath, p);
      }
    },
    onSuccess: invalidate
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marksApi.delete(selectedWorkspace!.workspaceId, id),
    onSuccess: invalidate
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="marks-app">
      {/* Sidebar: workspace list */}
      <aside className="marks-sidebar">
        <div className="marks-sidebar__header">
          <Bookmark size={16} />
          <h3>{t("marks.workspaces")}</h3>
        </div>
        <div className="marks-workspace-list">
          {workspaces.map((w) => (
            <button
              key={w.workspaceId}
              type="button"
              className={`marks-workspace-item ${selectedWorkspaceId === w.workspaceId ? "is-active" : ""}`}
              onClick={() => setSelectedWorkspaceId(w.workspaceId)}
            >
              <strong>{w.name}</strong>
              <span>{w.rootPath}</span>
            </button>
          ))}
          {workspaces.length === 0 && (
            <p className="marks-empty-hint">{t("marks.noWorkspaces")}</p>
          )}
        </div>
      </aside>

      {/* Main: bookmark list */}
      <motion.main className="marks-main" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {selectedWorkspace ? (
          <>
            <div className="marks-toolbar">
              <h3>{selectedWorkspace.name}</h3>
              <div className="marks-toolbar__actions">
                <button type="button" className="button button--ghost button--sm" onClick={() => addDirMutation.mutate()}>
                  <Folder size={14} /> {t("marks.addDir")}
                </button>
                <button type="button" className="button button--ghost button--sm" onClick={() => addFileMutation.mutate()}>
                  <File size={14} /> {t("marks.addFile")}
                </button>
              </div>
            </div>

            <div className="marks-list">
              {items.length === 0 ? (
                <div className="empty-state">
                  <p>{t("marks.empty")}</p>
                </div>
              ) : (
                items.map((item) => (
                  <BookmarkRow
                    key={item.id}
                    item={item}
                    onCopyAbsolute={() => copyToClipboard(item.absolutePath)}
                    onCopyRelative={() => copyToClipboard(item.relativePath)}
                    onDelete={() => deleteMutation.mutate(item.id)}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>{t("marks.selectWorkspace")}</p>
          </div>
        )}
      </motion.main>
    </div>
  );
}

function BookmarkRow({
  item,
  onCopyAbsolute,
  onCopyRelative,
  onDelete
}: {
  item: BookmarkItem;
  onCopyAbsolute: () => void;
  onCopyRelative: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mark-row">
      <span className="mark-icon">
        {item.type === "directory" ? <Folder size={16} /> : <File size={16} />}
      </span>
      <div className="mark-info">
        <strong>{item.label}</strong>
        <span>{item.relativePath}</span>
      </div>
      <div className="mark-actions">
        <button type="button" className="mark-action" onClick={onCopyAbsolute} title={t("marks.copyAbsolute")}>
          <ClipboardCopy size={13} /> {t("marks.absolute")}
        </button>
        <button type="button" className="mark-action" onClick={onCopyRelative} title={t("marks.copyRelative")}>
          <ClipboardCopy size={13} /> {t("marks.relative")}
        </button>
        <button type="button" className="mark-action mark-action--danger" onClick={onDelete} title={t("common.delete")}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
