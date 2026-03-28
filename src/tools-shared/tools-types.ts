export type TaskStatus = "not_started" | "in_progress" | "testing" | "completed" | "rework";
export type TaskPriority = "low" | "normal" | "high";

export interface TaskGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  groupId: string;
  hasReworked: boolean;
  createdAt: string;
  completedAt: string | null;
}

export type BookmarkEntryType = "file" | "directory";

export interface BookmarkEntry {
  id: string;
  absolutePath: string;
  relativePath: string;
  type: BookmarkEntryType;
}

export interface BookmarkGroup {
  id: string;
  name: string;
  entries: BookmarkEntry[];
  createdAt: string;
}

/* ── Memos ── */

export interface MemoGroup {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface MemoItem {
  id: string;
  title: string;
  content: string;
  groupId: string;
  createdAt: string;
  updatedAt: string;
}
