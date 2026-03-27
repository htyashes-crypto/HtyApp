export interface DesktopDialogFilter {
  name: string;
  extensions: string[];
}

export interface DesktopOpenDialogOptions {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
  defaultPath?: string;
  filters?: DesktopDialogFilter[];
}

export interface DesktopSaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: DesktopDialogFilter[];
}

export interface UpdateStatusEvent {
  type: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  version?: string;
  releaseNotes?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

export interface DesktopBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  openDialog(options: DesktopOpenDialogOptions): Promise<string | string[] | null>;
  saveDialog(options: DesktopSaveDialogOptions): Promise<string | null>;
  onSyncEvent(channel: string, callback: (data: unknown) => void): unknown;
  removeSyncEvent(channel: string, listener: unknown): void;
  getAppVersion(): Promise<string>;
  checkForUpdate(): Promise<unknown>;
  downloadUpdate(): Promise<void>;
  quitAndInstall(): Promise<void>;
  onUpdateStatus(callback: (data: UpdateStatusEvent) => void): unknown;
  removeUpdateStatus(listener: unknown): void;
}

declare global {
  interface Window {
    htyElectron?: DesktopBridge;
  }
}

export function getDesktopBridge() {
  const runtime = globalThis as typeof globalThis & { htyElectron?: DesktopBridge };
  return runtime.htyElectron ?? null;
}

export function isDesktopRuntime() {
  return Boolean(getDesktopBridge());
}
