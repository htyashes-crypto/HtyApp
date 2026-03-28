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

export type MemoPriority = "P0" | "P1" | "P2" | "P3" | "P4" | "P5";

export interface MemoItem {
  id: string;
  title: string;
  content: string;
  priority: MemoPriority;
  createdAt: string;
  updatedAt: string;
}
