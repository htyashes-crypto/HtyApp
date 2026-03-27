const { TodoStorage } = require("./tools-utils/todo-storage.cjs");
const { BookmarkStorage } = require("./tools-utils/bookmark-storage.cjs");

function createToolsService({ appDataDir }) {
  return new ToolsService(appDataDir);
}

class ToolsService {
  constructor(appDataDir) {
    this.todo = new TodoStorage(appDataDir);
    this.bookmark = new BookmarkStorage(appDataDir);
  }

  invoke(command, args = {}) {
    switch (command) {
      // Task Groups
      case "tasks_list_groups":
        return this.todo.listGroups();
      case "tasks_create_group":
        return this.todo.createGroup(args);
      case "tasks_rename_group":
        return this.todo.renameGroup(args);
      case "tasks_delete_group":
        return this.todo.deleteGroup(args);

      // Tasks
      case "tasks_list":
        return this.todo.list(args);
      case "tasks_create":
        return this.todo.create(args);
      case "tasks_update":
        return this.todo.update(args);
      case "tasks_delete":
        return this.todo.delete(args.id);
      case "tasks_advance":
        return this.todo.advance(args);
      case "tasks_rollback":
        return this.todo.rollback(args);
      case "tasks_rework":
        return this.todo.rework(args);
      case "tasks_clear_done":
      case "tasks_clear_completed":
        return this.todo.clearCompleted();

      // Marks
      case "marks_list_groups":
        return this.bookmark.listGroups(args.workspaceId);
      case "marks_create_group":
        return this.bookmark.createGroup(args);
      case "marks_rename_group":
        return this.bookmark.renameGroup(args);
      case "marks_delete_group":
        return this.bookmark.deleteGroup(args);
      case "marks_add_entry":
        return this.bookmark.addEntry(args);
      case "marks_delete_entry":
        return this.bookmark.deleteEntry(args);

      default:
        throw new Error(`unknown tools command: ${command}`);
    }
  }
}

module.exports = { createToolsService };
