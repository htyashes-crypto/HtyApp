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

export type BookmarkType = "file" | "directory";

export interface BookmarkItem {
  id: string;
  label: string;
  absolutePath: string;
  relativePath: string;
  type: BookmarkType;
  createdAt: string;
}
