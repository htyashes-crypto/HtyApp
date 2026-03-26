import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Check, Circle, Loader2, Plus, Trash2 } from "lucide-react";
import { tasksApi } from "../tools-shared/tools-api";
import type { TaskItem, TaskPriority, TaskStatus } from "../tools-shared/tools-types";

type FilterMode = "all" | "todo" | "done";

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export function TasksApp() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [adding, setAdding] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: tasksApi.list
  });

  const items = tasksQuery.data ?? [];

  const filtered = useMemo(() => {
    const list = filter === "all" ? items : items.filter((i) => i.status === filter);
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === "todo" ? -1 : 1;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [items, filter]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const createMutation = useMutation({
    mutationFn: () => tasksApi.create(newTitle.trim(), "", newPriority),
    onSuccess: () => { setNewTitle(""); setAdding(false); invalidate(); }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      tasksApi.update(id, { status: status === "todo" ? "done" : "todo" }),
    onSuccess: invalidate
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: invalidate
  });

  const clearDoneMutation = useMutation({
    mutationFn: () => tasksApi.clearDone(),
    onSuccess: invalidate
  });

  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div className="tasks-app">
      <motion.div className="tasks-container" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {/* Toolbar */}
        <div className="tasks-toolbar">
          <button type="button" className="button button--primary button--sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> {t("tasks.add")}
          </button>
          <div className="segmented-control">
            {(["all", "todo", "done"] as FilterMode[]).map((f) => (
              <button key={f} type="button" className={filter === f ? "is-active" : ""} onClick={() => setFilter(f)}>
                {t(`tasks.filter_${f}`)}
              </button>
            ))}
          </div>
          {doneCount > 0 && (
            <button type="button" className="button button--ghost button--sm" onClick={() => clearDoneMutation.mutate()}>
              {t("tasks.clearDone")} ({doneCount})
            </button>
          )}
        </div>

        {/* Inline add */}
        {adding && (
          <div className="tasks-add-row">
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as TaskPriority)} className="tasks-priority-select">
              <option value="high">{t("tasks.high")}</option>
              <option value="normal">{t("tasks.normal")}</option>
              <option value="low">{t("tasks.low")}</option>
            </select>
            <input
              autoFocus
              className="tasks-add-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("tasks.titlePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) createMutation.mutate();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <button type="button" className="button button--primary button--sm" disabled={!newTitle.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <Loader2 size={14} className="spin" /> : t("common.confirm")}
            </button>
            <button type="button" className="button button--ghost button--sm" onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </button>
          </div>
        )}

        {/* Task list */}
        <div className="tasks-list">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <p>{t("tasks.empty")}</p>
            </div>
          ) : (
            filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => toggleMutation.mutate({ id: task.id, status: task.status })}
                onDelete={() => deleteMutation.mutate(task.id)}
              />
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete }: { task: TaskItem; onToggle: () => void; onDelete: () => void }) {
  const isDone = task.status === "done";
  return (
    <div className={`task-row ${isDone ? "task-row--done" : ""}`}>
      <span className={`task-priority task-priority--${task.priority}`} />
      <button type="button" className="task-checkbox" onClick={onToggle}>
        {isDone ? <Check size={14} /> : <Circle size={14} />}
      </button>
      <div className="task-content">
        <span className={`task-title ${isDone ? "task-title--done" : ""}`}>{task.title}</span>
        {task.description && <span className="task-desc">{task.description}</span>}
      </div>
      <span className="task-time">{formatRelativeTime(task.createdAt)}</span>
      <button type="button" className="task-delete" onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
