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
      // Tasks
      case "tasks_list":
        return this.todo.list();
      case "tasks_create":
        return this.todo.create(args);
      case "tasks_update":
        return this.todo.update(args);
      case "tasks_delete":
        return this.todo.delete(args.id);
      case "tasks_clear_done":
        return this.todo.clearDone();

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
