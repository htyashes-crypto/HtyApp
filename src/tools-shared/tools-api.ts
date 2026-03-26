import { getDesktopBridge, isDesktopRuntime } from "../lib/desktop";
import type { TaskItem, TaskPriority, BookmarkItem } from "./tools-types";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error("desktop runtime unavailable");
  return bridge.invoke<T>(command, args);
}

export const tasksApi = {
  async list(): Promise<TaskItem[]> {
    return isDesktopRuntime() ? call<TaskItem[]>("tasks_list") : [];
  },
  async create(title: string, description?: string, priority?: TaskPriority): Promise<TaskItem> {
    return call<TaskItem>("tasks_create", { title, description, priority });
  },
  async update(id: string, fields: Partial<Pick<TaskItem, "title" | "description" | "status" | "priority">>): Promise<TaskItem> {
    return call<TaskItem>("tasks_update", { id, ...fields });
  },
  async delete(id: string): Promise<void> {
    await call<void>("tasks_delete", { id });
  },
  async clearDone(): Promise<number> {
    return call<number>("tasks_clear_done");
  }
};

export const marksApi = {
  async list(workspaceId: string): Promise<BookmarkItem[]> {
    return isDesktopRuntime() ? call<BookmarkItem[]>("marks_list", { workspaceId }) : [];
  },
  async add(workspaceId: string, workspaceRoot: string, absolutePath: string): Promise<BookmarkItem> {
    return call<BookmarkItem>("marks_add", { workspaceId, workspaceRoot, absolutePath });
  },
  async update(workspaceId: string, id: string, label: string): Promise<BookmarkItem> {
    return call<BookmarkItem>("marks_update", { workspaceId, id, label });
  },
  async delete(workspaceId: string, id: string): Promise<void> {
    await call<void>("marks_delete", { workspaceId, id });
  }
};
