import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Bookmark, ChevronDown, ChevronRight, ClipboardCopy, File, Folder, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { marksApi } from "../tools-shared/tools-api";
import type { BookmarkGroup, BookmarkEntry } from "../tools-shared/tools-types";
import { getDesktopBridge } from "../lib/desktop";

export function MarksApp() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: api.listWorkspaces });
  const workspaces = (workspacesQuery.data ?? []).filter((w) => w.kind === "project");
  const selectedWorkspace = workspaces.find((w) => w.workspaceId === selectedWorkspaceId) ?? null;

  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].workspaceId);
    }
  }, [selectedWorkspaceId, workspaces]);

  const groupsQuery = useQuery({
    queryKey: ["marks", selectedWorkspaceId],
    queryFn: () => marksApi.listGroups(selectedWorkspaceId!),
    enabled: Boolean(selectedWorkspaceId)
  });

  const groups = groupsQuery.data ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["marks", selectedWorkspaceId] });

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedWorkspace || !name.trim()) throw new Error("invalid");
      const group = await marksApi.createGroup(selectedWorkspace.workspaceId, selectedWorkspace.rootPath, name.trim());
      setExpandedGroups((prev) => new Set(prev).add(group.id));
      return group;
    },
    onSuccess: () => {
      setCreatingGroup(false);
      setNewGroupName("");
      invalidate();
    }
  });

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      createGroupMutation.mutate(newGroupName.trim());
    }
  };

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => marksApi.deleteGroup(selectedWorkspace!.workspaceId, groupId),
    onSuccess: invalidate
  });

  const addEntryMutation = useMutation({
    mutationFn: async ({ groupId, directory }: { groupId: string; directory: boolean }) => {
      if (!selectedWorkspace) return;
      const bridge = getDesktopBridge();
      if (!bridge) return;
      const result = await bridge.openDialog({
        title: directory ? t("marks.pickDir") : t("marks.pickFile"),
        directory,
        multiple: !directory,
        defaultPath: selectedWorkspace.rootPath
      });
      if (!result) return;
      const paths = Array.isArray(result) ? result : [result];
      for (const p of paths) {
        await marksApi.addEntry(selectedWorkspace.workspaceId, selectedWorkspace.rootPath, groupId, p);
      }
    },
    onSuccess: invalidate
  });

  const deleteEntryMutation = useMutation({
    mutationFn: ({ groupId, entryId }: { groupId: string; entryId: string }) =>
      marksApi.deleteEntry(selectedWorkspace!.workspaceId, groupId, entryId),
    onSuccess: invalidate
  });

  const copyAll = (group: BookmarkGroup, mode: "absolute" | "relative") => {
    const text = group.entries
      .map((e) => mode === "absolute" ? e.absolutePath : e.relativePath)
      .join("\n");
    navigator.clipboard.writeText(text);
  };

  const copySingle = (text: string) => navigator.clipboard.writeText(text);

  return (
    <div className="marks-app">
      {/* Sidebar */}
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
          {workspaces.length === 0 && <p className="marks-empty-hint">{t("marks.noWorkspaces")}</p>}
        </div>
      </aside>

      {/* Main */}
      <motion.main className="marks-main" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {selectedWorkspace ? (
          <>
            <div className="marks-toolbar">
              <h3>{selectedWorkspace.name}</h3>
              <button type="button" className="button button--primary button--sm" onClick={() => setCreatingGroup(true)}>
                <Plus size={14} /> {t("marks.newGroup")}
              </button>
            </div>

            {creatingGroup && (
              <div className="marks-create-row">
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={t("marks.groupNamePrompt")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateGroup();
                    if (e.key === "Escape") { setCreatingGroup(false); setNewGroupName(""); }
                  }}
                />
                <button type="button" className="button button--primary button--sm" disabled={!newGroupName.trim()} onClick={handleCreateGroup}>
                  {t("common.confirm")}
                </button>
                <button type="button" className="button button--ghost button--sm" onClick={() => { setCreatingGroup(false); setNewGroupName(""); }}>
                  {t("common.cancel")}
                </button>
              </div>
            )}

            <div className="marks-group-list">
              {groups.length === 0 ? (
                <div className="empty-state"><p>{t("marks.empty")}</p></div>
              ) : (
                groups.map((group) => {
                  const isOpen = expandedGroups.has(group.id);
                  return (
                    <div key={group.id} className="marks-group">
                      {/* Group header */}
                      <div className="marks-group__header">
                        <button type="button" className="marks-group__toggle" onClick={() => toggleGroup(group.id)}>
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <strong>{group.name}</strong>
                          <span className="marks-group__count">{group.entries.length}</span>
                        </button>
                        <div className="marks-group__actions">
                          <button type="button" className="mark-action" onClick={() => copyAll(group, "absolute")} title={t("marks.copyAllAbsolute")}>
                            <ClipboardCopy size={12} /> {t("marks.absolute")}
                          </button>
                          <button type="button" className="mark-action" onClick={() => copyAll(group, "relative")} title={t("marks.copyAllRelative")}>
                            <ClipboardCopy size={12} /> {t("marks.relative")}
                          </button>
                          <button type="button" className="mark-action" onClick={() => addEntryMutation.mutate({ groupId: group.id, directory: true })}>
                            <Folder size={12} />
                          </button>
                          <button type="button" className="mark-action" onClick={() => addEntryMutation.mutate({ groupId: group.id, directory: false })}>
                            <File size={12} />
                          </button>
                          <button type="button" className="mark-action mark-action--danger" onClick={() => deleteGroupMutation.mutate(group.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Entries */}
                      {isOpen && (
                        <div className="marks-group__entries">
                          {group.entries.length === 0 ? (
                            <p className="marks-group__empty">{t("marks.groupEmpty")}</p>
                          ) : (
                            group.entries.map((entry) => (
                              <div key={entry.id} className="marks-entry">
                                <span className="mark-icon">
                                  {entry.type === "directory" ? <Folder size={14} /> : <File size={14} />}
                                </span>
                                <div className="marks-entry__info">
                                  <span className="marks-entry__abs">{entry.absolutePath}</span>
                                  <span className="marks-entry__rel">{entry.relativePath}</span>
                                </div>
                                <div className="marks-entry__actions">
                                  <button type="button" className="mark-action" onClick={() => copySingle(entry.absolutePath)} title={t("marks.copyAbsolute")}>
                                    <ClipboardCopy size={11} /> {t("marks.absolute")}
                                  </button>
                                  <button type="button" className="mark-action" onClick={() => copySingle(entry.relativePath)} title={t("marks.copyRelative")}>
                                    <ClipboardCopy size={11} /> {t("marks.relative")}
                                  </button>
                                  <button type="button" className="mark-action mark-action--danger" onClick={() => deleteEntryMutation.mutate({ groupId: group.id, entryId: entry.id })}>
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="empty-state"><p>{t("marks.selectWorkspace")}</p></div>
        )}
      </motion.main>
    </div>
  );
}
