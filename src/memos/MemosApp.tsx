import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ClipboardCopy, Plus, Trash2, X } from "lucide-react";
import { memosApi } from "../tools-shared/tools-api";
import type { MemoItem, MemoPriority } from "../tools-shared/tools-types";
import { confirm } from "../state/confirm-store";
import { toast } from "../state/toast-store";

const PRIORITIES: MemoPriority[] = ["P0", "P1", "P2", "P3", "P4", "P5"];

const PRIORITY_COLORS: Record<MemoPriority, string> = {
  P0: "#f87171",
  P1: "#fb923c",
  P2: "#fbbf24",
  P3: "#60a5fa",
  P4: "#34d399",
  P5: "#9fb0c2"
};

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
  const [filterPriority, setFilterPriority] = useState<MemoPriority | "all">("all");
  const [editingMemo, setEditingMemo] = useState<MemoItem | null>(null);

  const memosQuery = useQuery({ queryKey: ["memos"], queryFn: memosApi.list });
  const items = memosQuery.data ?? [];

  const filtered = useMemo(() => {
    if (filterPriority === "all") return items;
    return items.filter((m) => m.priority === filterPriority);
  }, [items, filterPriority]);

  const createMutation = useMutation({
    mutationFn: () => memosApi.create("", "", "P3"),
    onSuccess: (newMemo) => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      setEditingMemo(newMemo);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => memosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<Pick<MemoItem, "title" | "content" | "priority">> }) =>
      memosApi.update(id, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
    }
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
    (id: string, fields: Partial<Pick<MemoItem, "title" | "content" | "priority">>) => {
      updateMutation.mutate({ id, fields });
    },
    [updateMutation]
  );

  const handleEditClose = () => {
    setEditingMemo(null);
  };

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
            className={`memos-filter-tab ${filterPriority === "all" ? "is-active" : ""}`}
            onClick={() => setFilterPriority("all")}
          >
            {t("memos.filterAll")}
          </button>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              className={`memos-filter-tab ${filterPriority === p ? "is-active" : ""}`}
              style={{ color: filterPriority === p ? PRIORITY_COLORS[p] : undefined }}
              onClick={() => setFilterPriority(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>{t("memos.empty")}</p>
        </div>
      ) : (
        <div className="memos-grid">
          {filtered.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
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
            onClose={handleEditClose}
            onUpdate={handleUpdate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MemoCard({
  memo,
  onEdit,
  onDelete,
  onCopy
}: {
  memo: MemoItem;
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
      <span
        className="memo-card__priority"
        style={{ background: PRIORITY_COLORS[memo.priority] }}
      >
        {memo.priority}
      </span>
      <h4 className="memo-card__title">
        {memo.title || t("memos.untitled")}
      </h4>
      <p className="memo-card__preview">{memo.content}</p>
      <div className="memo-card__footer">
        <span>{formatRelativeTime(memo.updatedAt)}</span>
        <div className="memo-card__actions">
          <button
            title={t("memos.copyContent")}
            onClick={(e) => { e.stopPropagation(); onCopy(memo); }}
          >
            <ClipboardCopy size={13} />
          </button>
          <button
            title={t("common.delete")}
            onClick={(e) => { e.stopPropagation(); onDelete(memo.id); }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MemoEditDialog({
  memo,
  onClose,
  onUpdate
}: {
  memo: MemoItem;
  onClose: () => void;
  onUpdate: (id: string, fields: Partial<Pick<MemoItem, "title" | "content" | "priority">>) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(memo.title);
  const [content, setContent] = useState(memo.content);
  const [priority, setPriority] = useState<MemoPriority>(memo.priority);
  const timerRef = useRef<number | null>(null);
  const latestRef = useRef({ title, content, priority });

  useEffect(() => {
    latestRef.current = { title, content, priority };
  }, [title, content, priority]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onUpdate(memo.id, latestRef.current);
  }, [memo.id, onUpdate]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 300);
  }, [flush]);

  useEffect(() => {
    scheduleSave();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, content, priority, scheduleSave]);

  const handleClose = () => {
    flush();
    onClose();
  };

  const handlePriorityChange = (p: MemoPriority) => {
    setPriority(p);
  };

  return (
    <motion.div
      className="memo-edit-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={handleClose}
    >
      <motion.div
        className="memo-edit-dialog"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="memo-edit-dialog__close" onClick={handleClose}>
          <X size={18} />
        </button>

        <input
          className="memo-edit-dialog__title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("memos.titlePlaceholder")}
          autoFocus
        />

        <div className="memo-edit-dialog__priority">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              className={priority === p ? "is-active" : ""}
              style={{
                background: priority === p ? PRIORITY_COLORS[p] : "transparent",
                color: priority === p ? "#fff" : PRIORITY_COLORS[p],
                borderColor: PRIORITY_COLORS[p]
              }}
              onClick={() => handlePriorityChange(p)}
            >
              {p}
            </button>
          ))}
        </div>

        <textarea
          className="memo-edit-dialog__content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("memos.contentPlaceholder")}
        />
      </motion.div>
    </motion.div>
  );
}
