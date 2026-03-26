import { getDesktopBridge, isDesktopRuntime } from "../lib/desktop";
import type { TaskItem, TaskPriority, BookmarkGroup, BookmarkEntry } from "./tools-types";

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
  async listGroups(workspaceId: string): Promise<BookmarkGroup[]> {
    return isDesktopRuntime() ? call<BookmarkGroup[]>("marks_list_groups", { workspaceId }) : [];
  },
  async createGroup(workspaceId: string, workspaceRoot: string, name: string): Promise<BookmarkGroup> {
    return call<BookmarkGroup>("marks_create_group", { workspaceId, workspaceRoot, name });
  },
  async renameGroup(workspaceId: string, groupId: string, name: string): Promise<BookmarkGroup> {
    return call<BookmarkGroup>("marks_rename_group", { workspaceId, groupId, name });
  },
  async deleteGroup(workspaceId: string, groupId: string): Promise<void> {
    await call<void>("marks_delete_group", { workspaceId, groupId });
  },
  async addEntry(workspaceId: string, workspaceRoot: string, groupId: string, absolutePath: string): Promise<BookmarkEntry> {
    return call<BookmarkEntry>("marks_add_entry", { workspaceId, workspaceRoot, groupId, absolutePath });
  },
  async deleteEntry(workspaceId: string, groupId: string, entryId: string): Promise<void> {
    await call<void>("marks_delete_entry", { workspaceId, groupId, entryId });
  }
};
