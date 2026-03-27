import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { tasksApi } from "../tools-shared/tools-api";
import type { TaskItem, TaskGroup, TaskPriority, TaskStatus } from "../tools-shared/tools-types";

type FilterMode = "all" | "active" | "completed";

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

const STATUS_ORDER: Record<TaskStatus, number> = {
  not_started: 0,
  rework: 1,
  in_progress: 2,
  testing: 3,
  completed: 4
};

function canAdvance(status: TaskStatus): boolean {
  return status !== "completed";
}

function canRollback(task: TaskItem): boolean {
  if (task.hasReworked) return task.status !== "rework";
  return task.status !== "not_started";
}

function canRework(status: TaskStatus): boolean {
  return status === "completed";
}

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
  const [selectedGroupId, setSelectedGroupId] = useState<string>("default");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [adding, setAdding] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const groupsQuery = useQuery({ queryKey: ["task-groups"], queryFn: tasksApi.listGroups });
  const tasksQuery = useQuery({
    queryKey: ["tasks", selectedGroupId],
    queryFn: () => tasksApi.list(selectedGroupId)
  });
  const allTasksQuery = useQuery({ queryKey: ["tasks"], queryFn: () => tasksApi.list() });

  const groups = groupsQuery.data ?? [];
  const items = tasksQuery.data ?? [];
  const allItems = allTasksQuery.data ?? [];

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "active") list = items.filter((i) => i.status !== "completed");
    else if (filter === "completed") list = items.filter((i) => i.status === "completed");
    return [...list].sort((a, b) => {
      const aCompleted = a.status === "completed" ? 1 : 0;
      const bCompleted = b.status === "completed" ? 1 : 0;
      if (aCompleted !== bCompleted) return aCompleted - bCompleted;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [items, filter]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["task-groups"] });
  };

  // Group mutations
  const createGroupMutation = useMutation({
    mutationFn: () => tasksApi.createGroup(newGroupName.trim()),
    onSuccess: (group) => {
      setNewGroupName("");
      setCreatingGroup(false);
      setSelectedGroupId(group.id);
      invalidateAll();
    }
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => tasksApi.deleteGroup(groupId),
    onSuccess: () => { setSelectedGroupId("default"); invalidateAll(); }
  });

  // Task mutations
  const createMutation = useMutation({
    mutationFn: () => tasksApi.create(newTitle.trim(), "", newPriority, selectedGroupId),
    onSuccess: () => { setNewTitle(""); setAdding(false); invalidateAll(); }
  });

  const advanceMutation = useMutation({
    mutationFn: (id: string) => tasksApi.advance(id),
    onSuccess: invalidateAll
  });

  const rollbackMutation = useMutation({
    mutationFn: (id: string) => tasksApi.rollback(id),
    onSuccess: invalidateAll
  });

  const reworkMutation = useMutation({
    mutationFn: (id: string) => tasksApi.rework(id),
    onSuccess: invalidateAll
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: invalidateAll
  });

  const clearCompletedMutation = useMutation({
    mutationFn: () => tasksApi.clearCompleted(),
    onSuccess: invalidateAll
  });

  const completedCount = items.filter((i) => i.status === "completed").length;

  function getGroupTaskCount(groupId: string): number {
    return allItems.filter((i) => i.groupId === groupId && i.status !== "completed").length;
  }

  return (
    <div className="tasks-app">
      {/* Sidebar */}
      <div className="tasks-sidebar">
        <div className="tasks-sidebar__header">
          <h3>{t("tasks.newGroup").replace("新建", "").replace("New ", "") || "任务组"}</h3>
          <button type="button" className="button button--ghost button--sm" onClick={() => setCreatingGroup(true)}>
            <Plus size={14} />
          </button>
        </div>

        {creatingGroup && (
          <div className="tasks-create-group-row">
            <input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder={t("tasks.groupName")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGroupName.trim()) createGroupMutation.mutate();
                if (e.key === "Escape") { setCreatingGroup(false); setNewGroupName(""); }
              }}
            />
            <button type="button" className="button button--primary button--sm" disabled={!newGroupName.trim()} onClick={() => createGroupMutation.mutate()}>
              {t("common.confirm")}
            </button>
          </div>
        )}

        <div className="tasks-group-list">
          {groups.map((group) => (
            <div
              key={group.id}
              className={`tasks-group-item ${selectedGroupId === group.id ? "is-active" : ""}`}
              onClick={() => setSelectedGroupId(group.id)}
            >
              <span className="tasks-group-item__name">{group.id === "default" ? t("tasks.defaultGroup") : group.name}</span>
              <span className="tasks-group-item__count">{getGroupTaskCount(group.id)}</span>
              {group.id !== "default" && (
                <button
                  type="button"
                  className="tasks-group-item__delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t("tasks.deleteGroup"))) deleteGroupMutation.mutate(group.id);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="tasks-main">
        <motion.div className="tasks-container" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {/* Toolbar */}
          <div className="tasks-toolbar">
            <button type="button" className="button button--primary button--sm" onClick={() => setAdding(true)}>
              <Plus size={14} /> {t("tasks.add")}
            </button>
            <div className="segmented-control">
              {(["all", "active", "completed"] as FilterMode[]).map((f) => (
                <button key={f} type="button" className={filter === f ? "is-active" : ""} onClick={() => setFilter(f)}>
                  {t(`tasks.filter_${f}`)}
                </button>
              ))}
            </div>
            {completedCount > 0 && (
              <button type="button" className="button button--ghost button--sm" onClick={() => clearCompletedMutation.mutate()}>
                {t("tasks.clearCompleted")} ({completedCount})
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
                  onAdvance={() => advanceMutation.mutate(task.id)}
                  onRollback={() => rollbackMutation.mutate(task.id)}
                  onRework={() => reworkMutation.mutate(task.id)}
                  onDelete={() => deleteMutation.mutate(task.id)}
                />
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onAdvance,
  onRollback,
  onRework,
  onDelete
}: {
  task: TaskItem;
  onAdvance: () => void;
  onRollback: () => void;
  onRework: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const isCompleted = task.status === "completed";

  return (
    <div className={`task-row ${isCompleted ? "task-row--completed" : ""}`}>
      <span className={`task-priority task-priority--${task.priority}`} />
      <span className={`task-status-badge task-status-badge--${task.status}`}>
        {t(`tasks.status_${task.status}`)}
      </span>
      <div className="task-content">
        <span className={`task-title ${isCompleted ? "task-title--completed" : ""}`}>{task.title}</span>
        {task.description && <span className="task-desc">{task.description}</span>}
      </div>
      <span className="task-time">{formatRelativeTime(task.createdAt)}</span>
      <div className="task-actions">
        {canRollback(task) && (
          <button type="button" className="task-action-btn" onClick={onRollback} title={t("tasks.rollback")}>
            <ChevronLeft size={14} />
          </button>
        )}
        {canAdvance(task.status) && (
          <button type="button" className="task-action-btn task-action-btn--advance" onClick={onAdvance} title={t("tasks.advance")}>
            <ChevronRight size={14} />
          </button>
        )}
        {canRework(task.status) && (
          <button type="button" className="task-action-btn task-action-btn--rework" onClick={onRework} title={t("tasks.rework")}>
            <RotateCcw size={14} />
          </button>
        )}
      </div>
      <button type="button" className="task-delete" onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
