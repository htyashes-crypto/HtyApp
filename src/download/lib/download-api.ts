import type { DownloadItem, DownloadSettings, CreateDownloadRequest } from "./download-types";
import { getDesktopBridge } from "../../lib/desktop";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = getDesktopBridge();
  if (!bridge) throw new Error("desktop runtime unavailable");
  return bridge.invoke<T>(command, args);
}

export const downloadApi = {
  list: () => call<DownloadItem[]>("dl_list"),
  create: (req: CreateDownloadRequest) => call<DownloadItem>("dl_create", req as unknown as Record<string, unknown>),
  pause: (id: string) => call<void>("dl_pause", { id }),
  resume: (id: string) => call<void>("dl_resume", { id }),
  cancel: (id: string) => call<void>("dl_cancel", { id }),
  delete: (id: string, deleteFile?: boolean) => call<void>("dl_delete", { id, deleteFile }),
  retry: (id: string) => call<void>("dl_retry", { id }),
  pauseAll: () => call<void>("dl_pause_all"),
  resumeAll: () => call<void>("dl_resume_all"),
  clearCompleted: () => call<number>("dl_clear_completed"),
  getSettings: () => call<DownloadSettings>("dl_get_settings"),
  saveSettings: (settings: Partial<DownloadSettings>) => call<DownloadSettings>("dl_save_settings", { settings }),
  openFile: (filePath: string) => call<void>("dl_open_file", { filePath }),
  revealFile: (filePath: string) => call<void>("dl_reveal_file", { filePath })
};
