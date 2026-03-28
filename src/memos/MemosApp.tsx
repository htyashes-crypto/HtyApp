import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ClipboardCopy, Plus, Trash2, X, Pencil } from "lucide-react";
import { memosApi } from "../tools-shared/tools-api";
import type { MemoItem, MemoGroup } from "../tools-shared/tools-types";
import { MemoEditor } from "./MemoEditor";
import { confirm } from "../state/confirm-store";
import { toast } from "../state/toast-store";

const PRESET_COLORS = [
  "#f87171", "#fb923c", "#fbbf24", "#a3e635",
  "#34d399", "#22d3ee", "#60a5fa", "#a78bfa",
  "#f472b6", "#9fb0c2"
];

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString();
}

export function MemosApp() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filterGroupId, setFilterGroupId] = useState<string | "all">("all");
  const [editingMemo, setEditingMemo] = useState<MemoItem | null>(null);
  const [showGroupManager, setShowGroupManager] = useState(false);

  const groupsQuery = useQuery({ queryKey: ["memo-groups"], queryFn: memosApi.listGroups });
  const memosQuery = useQuery({ queryKey: ["memos"], queryFn: memosApi.list });
  const groups = groupsQuery.data ?? [];
  const items = memosQuery.data ?? [];
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const filtered = useMemo(() => {
    if (filterGroupId === "all") return items;
    return items.filter((m) => m.groupId === filterGroupId);
  }, [items, filterGroupId]);

  const invalidateAll = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["memos"] }),
    queryClient.invalidateQueries({ queryKey: ["memo-groups"] })
  ]);

  const defaultGroupId = groups.length > 0 ? groups[0].id : "";

  const createMutation = useMutation({
    mutationFn: () => {
      const gid = filterGroupId !== "all" ? filterGroupId : defaultGroupId;
      return memosApi.create("", "", gid);
    },
    onSuccess: async (newMemo) => {
      await invalidateAll();
      setEditingMemo(newMemo);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => memosApi.delete(id),
    onSuccess: () => invalidateAll()
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<Pick<MemoItem, "title" | "content" | "groupId">> }) =>
      memosApi.update(id, fields),
    onSuccess: () => invalidateAll()
  });

  const handleDelete = async (id: string) => {
    const ok = await confirm(t("common.delete"), t("memos.deleteConfirm"));
    if (ok) deleteMutation.mutate(id);
  };

  const handleCopy = (memo: MemoItem) => {
    const text = memo.title ? `${memo.title}\n${memo.content}` : memo.content;
    navigator.clipboard.writeText(text);
    toast("success", t("memos.copied"));
  };

  const handleUpdate = useCallback(
    (id: string, fields: Partial<Pick<MemoItem, "title" | "content" | "groupId">>) => {
      updateMutation.mutate({ id, fields });
    },
    [updateMutation]
  );

  return (
    <div className="memos-app">
      <div className="memos-header">
        <h2>{t("memos.title")}</h2>
        <button
          className="button button--primary"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          <Plus size={14} /> {t("memos.add")}
        </button>
        <div className="memos-filter-tabs">
          <button
            className={`memos-filter-tab ${filterGroupId === "all" ? "is-active" : ""}`}
            onClick={() => setFilterGroupId("all")}
          >
            {t("memos.filterAll")}
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              className={`memos-filter-tab ${filterGroupId === g.id ? "is-active" : ""}`}
              style={{
                color: filterGroupId === g.id ? g.color : undefined,
                borderColor: filterGroupId === g.id ? g.color : undefined
              }}
              onClick={() => setFilterGroupId(g.id)}
            >
              <span className="memos-filter-tab__dot" style={{ background: g.color }} />
              {g.name}
            </button>
          ))}
          <button
            className="memos-filter-tab memos-filter-tab--manage"
            onClick={() => setShowGroupManager(true)}
            title={t("memos.manageGroups")}
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><p>{t("memos.empty")}</p></div>
      ) : (
        <div className="memos-grid">
          {filtered.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              group={groupMap.get(memo.groupId)}
              onEdit={setEditingMemo}
              onDelete={handleDelete}
              onCopy={handleCopy}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {editingMemo && (
          <MemoEditDialog
            memo={editingMemo}
            groups={groups}
            onClose={() => setEditingMemo(null)}
            onUpdate={handleUpdate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGroupManager && (
          <GroupManagerDialog
            groups={groups}
            onClose={() => setShowGroupManager(false)}
            onChanged={invalidateAll}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MemoCard({
  memo, group, onEdit, onDelete, onCopy
}: {
  memo: MemoItem;
  group: MemoGroup | undefined;
  onEdit: (m: MemoItem) => void;
  onDelete: (id: string) => void;
  onCopy: (m: MemoItem) => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="memo-card"
      onClick={() => onEdit(memo)}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      layout
    >
      {group && (
        <span className="memo-card__group" style={{ background: group.color }}>
          {group.name}
        </span>
      )}
      <h4 className="memo-card__title">{memo.title || t("memos.untitled")}</h4>
      <p className="memo-card__preview">{memo.content}</p>
      <div className="memo-card__footer">
        <span>{formatRelativeTime(memo.updatedAt)}</span>
        <div className="memo-card__actions">
          <button title={t("memos.copyContent")} onClick={(e) => { e.stopPropagation(); onCopy(memo); }}>
            <ClipboardCopy size={13} />
          </button>
          <button title={t("common.delete")} onClick={(e) => { e.stopPropagation(); onDelete(memo.id); }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MemoEditDialog({
  memo, groups, onClose, onUpdate
}: {
  memo: MemoItem;
  groups: MemoGroup[];
  onClose: () => void;
  onUpdate: (id: string, fields: Partial<Pick<MemoItem, "title" | "content" | "groupId">>) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(memo.title);
  const [content, setContent] = useState(memo.content);
  const [groupId, setGroupId] = useState(memo.groupId);
  const timerRef = useRef<number | null>(null);
  const latestRef = useRef({ title, content, groupId });

  useEffect(() => {
    latestRef.current = { title, content, groupId };
  }, [title, content, groupId]);

  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    onUpdate(memo.id, latestRef.current);
  }, [memo.id, onUpdate]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 300);
  }, [flush]);

  useEffect(() => {
    scheduleSave();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [title, content, groupId, scheduleSave]);

  const handleClose = () => { flush(); onClose(); };

  return (
    <motion.div
      className="memo-edit-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }} onClick={handleClose}
    >
      <motion.div
        className="memo-edit-dialog"
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="memo-edit-dialog__header">
          <input
            className="memo-edit-dialog__title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("memos.titlePlaceholder")}
            autoFocus
          />
          <button className="memo-edit-dialog__close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="memo-edit-dialog__group-selector">
          {groups.map((g) => (
            <button
              key={g.id}
              className={groupId === g.id ? "is-active" : ""}
              style={{
                background: groupId === g.id ? g.color : "transparent",
                color: groupId === g.id ? "#fff" : g.color,
                borderColor: g.color
              }}
              onClick={() => setGroupId(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>

        <MemoEditor content={content} placeholder={t("memos.contentPlaceholder")} onChange={setContent} />
      </motion.div>
    </motion.div>
  );
}

function GroupManagerDialog({
  groups, onClose, onChanged
}: {
  groups: MemoGroup[];
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await memosApi.createGroup(newName.trim(), newColor);
    setNewName("");
    await onChanged();
  };

  const handleDelete = async (groupId: string) => {
    const ok = await confirm(t("common.delete"), t("memos.deleteGroupConfirm"));
    if (!ok) return;
    await memosApi.deleteGroup(groupId);
    await onChanged();
  };

  const startEdit = (g: MemoGroup) => {
    setEditingId(g.id);
    setEditName(g.name);
    setEditColor(g.color);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await memosApi.renameGroup(editingId, editName.trim(), editColor);
    setEditingId(null);
    await onChanged();
  };

  return (
    <motion.div
      className="dialog-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }} onClick={onClose}
    >
      <motion.div
        className="dialog group-manager-dialog"
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__header">
          <h3>{t("memos.manageGroups")}</h3>
          <button className="button button--ghost" onClick={onClose}>{t("common.close")}</button>
        </div>

        <div className="group-manager__list">
          {groups.map((g) => (
            <div key={g.id} className="group-manager__item">
              {editingId === g.id ? (
                <>
                  <input
                    className="group-manager__name-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    autoFocus
                  />
                  <div className="group-manager__colors">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`group-manager__color-dot ${editColor === c ? "is-active" : ""}`}
                        style={{ background: c }}
                        onClick={() => setEditColor(c)}
                      />
                    ))}
                  </div>
                  <button className="button button--primary group-manager__save-btn" onClick={saveEdit}>
                    {t("common.save")}
                  </button>
                </>
              ) : (
                <>
                  <span className="group-manager__dot" style={{ background: g.color }} />
                  <span className="group-manager__name">{g.name}</span>
                  <button className="group-manager__action" onClick={() => startEdit(g)}>
                    <Pencil size={13} />
                  </button>
                  <button className="group-manager__action group-manager__action--danger" onClick={() => handleDelete(g.id)}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="group-manager__add">
          <div className="group-manager__colors">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={`group-manager__color-dot ${newColor === c ? "is-active" : ""}`}
                style={{ background: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <div className="group-manager__add-row">
            <input
              className="group-manager__name-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("memos.newGroupPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <button className="button button--primary" onClick={handleCreate} disabled={!newName.trim()}>
              <Plus size={14} /> {t("common.add")}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
