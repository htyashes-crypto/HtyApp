export interface DesktopDialogFilter {
  name: string;
  extensions: string[];
}

export interface DesktopOpenDialogOptions {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
  filters?: DesktopDialogFilter[];
}

export interface DesktopSaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: DesktopDialogFilter[];
}

export interface DesktopBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  openDialog(options: DesktopOpenDialogOptions): Promise<string | string[] | null>;
  saveDialog(options: DesktopSaveDialogOptions): Promise<string | null>;
  onSyncEvent(channel: string, callback: (data: unknown) => void): unknown;
  removeSyncEvent(channel: string, listener: unknown): void;
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
