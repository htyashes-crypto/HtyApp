import { getDesktopBridge, isDesktopRuntime } from "../lib/desktop";
import type { TaskItem, TaskGroup, TaskPriority, BookmarkGroup, BookmarkEntry, MemoItem, MemoGroup } from "./tools-types";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error("desktop runtime unavailable");
  return bridge.invoke<T>(command, args);
}

export const tasksApi = {
  // Group management
  async listGroups(): Promise<TaskGroup[]> {
    return isDesktopRuntime() ? call<TaskGroup[]>("tasks_list_groups") : [];
  },
  async createGroup(name: string): Promise<TaskGroup> {
    return call<TaskGroup>("tasks_create_group", { name });
  },
  async renameGroup(groupId: string, name: string): Promise<TaskGroup> {
    return call<TaskGroup>("tasks_rename_group", { groupId, name });
  },
  async deleteGroup(groupId: string): Promise<void> {
    await call<void>("tasks_delete_group", { groupId });
  },

  // Tasks
  async list(groupId?: string): Promise<TaskItem[]> {
    return isDesktopRuntime() ? call<TaskItem[]>("tasks_list", groupId ? { groupId } : {}) : [];
  },
  async create(title: string, description: string, priority: TaskPriority, groupId: string): Promise<TaskItem> {
    return call<TaskItem>("tasks_create", { title, description, priority, groupId });
  },
  async update(id: string, fields: Partial<Pick<TaskItem, "title" | "description" | "priority">>): Promise<TaskItem> {
    return call<TaskItem>("tasks_update", { id, ...fields });
  },
  async delete(id: string): Promise<void> {
    await call<void>("tasks_delete", { id });
  },

  // Progress control
  async advance(id: string): Promise<TaskItem> {
    return call<TaskItem>("tasks_advance", { id });
  },
  async rollback(id: string): Promise<TaskItem> {
    return call<TaskItem>("tasks_rollback", { id });
  },
  async rework(id: string): Promise<TaskItem> {
    return call<TaskItem>("tasks_rework", { id });
  },

  async clearCompleted(): Promise<number> {
    return call<number>("tasks_clear_completed");
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

export const memosApi = {
  // Groups
  async listGroups(): Promise<MemoGroup[]> {
    return isDesktopRuntime() ? call<MemoGroup[]>("memos_list_groups") : [];
  },
  async createGroup(name: string, color: string): Promise<MemoGroup> {
    return call<MemoGroup>("memos_create_group", { name, color });
  },
  async renameGroup(groupId: string, name: string, color: string): Promise<MemoGroup> {
    return call<MemoGroup>("memos_rename_group", { groupId, name, color });
  },
  async deleteGroup(groupId: string): Promise<void> {
    await call<void>("memos_delete_group", { groupId });
  },

  // Items
  async list(): Promise<MemoItem[]> {
    return isDesktopRuntime() ? call<MemoItem[]>("memos_list") : [];
  },
  async create(title: string, content: string, groupId: string): Promise<MemoItem> {
    return call<MemoItem>("memos_create", { title, content, groupId });
  },
  async update(id: string, fields: Partial<Pick<MemoItem, "title" | "content" | "groupId">>): Promise<MemoItem> {
    return call<MemoItem>("memos_update", { id, ...fields });
  },
  async delete(id: string): Promise<void> {
    await call<void>("memos_delete", { id });
  }
};
