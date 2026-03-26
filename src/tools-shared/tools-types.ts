export type TaskStatus = "todo" | "done";
export type TaskPriority = "low" | "normal" | "high";

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
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
