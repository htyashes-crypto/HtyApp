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
      case "marks_list":
        return this.bookmark.list(args.workspaceId);
      case "marks_add":
        return this.bookmark.add(args);
      case "marks_update":
        return this.bookmark.update(args);
      case "marks_delete":
        return this.bookmark.delete(args.workspaceId, args.id);

      default:
        throw new Error(`unknown tools command: ${command}`);
    }
  }
}

module.exports = { createToolsService };
