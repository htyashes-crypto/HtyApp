import { getDesktopBridge, isDesktopRuntime } from "./desktop";

function normalizeSelection(selection: string | string[] | null) {
  if (!selection) {
    return null;
  }
  return Array.isArray(selection) ? selection[0] ?? null : selection;
}

async function pickDirectory(title: string, fallbackPrompt: string) {
  if (!isDesktopRuntime()) {
    return window.prompt(fallbackPrompt);
  }

  return normalizeSelection(
    await getDesktopBridge()!.openDialog({
      directory: true,
      multiple: false,
      title
    })
  );
}

export async function pickWorkspaceRoot() {
  return pickDirectory("选择需要接入的工作区根目录", "输入需要接入的工作区根目录");
}

export async function pickLibraryRoot() {
  return pickDirectory("选择全局库根目录", "输入全局库根目录");
}

export async function pickImportPackagePath() {
  if (!isDesktopRuntime()) {
    return window.prompt("输入需要导入的 .htyskillpkg 路径");
  }

  return normalizeSelection(
    await getDesktopBridge()!.openDialog({
      multiple: false,
      title: "选择需要导入的 Hty Skill 包",
      filters: [
        {
          name: "Hty Skill Package",
          extensions: ["htyskillpkg"]
        }
      ]
    })
  );
}

export async function pickExportPackagePath(defaultName: string) {
  if (!isDesktopRuntime()) {
    return window.prompt("输入导出包路径", defaultName);
  }

  return getDesktopBridge()!.saveDialog({
    title: "导出 Hty Skill 包",
    defaultPath: defaultName,
    filters: [
      {
        name: "Hty Skill Package",
        extensions: ["htyskillpkg"]
      }
    ]
  });
}
