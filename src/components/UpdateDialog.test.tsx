/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatusEvent } from "../lib/desktop";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "update.title": "Update Available",
        "update.changelog": "What's New",
        "update.currentVersion": "Current version:",
        "update.download": "Download",
        "update.downloading": "Downloading...",
        "update.readyToInstall": `v${opts?.version ?? ""} is ready`,
        "update.installNow": "Restart Now",
        "update.later": "Later",
        "update.errorLabel": "Error",
        "update.close": "Close",
        "update.copy": "Copy",
        "update.errorGeneric": "Unknown error"
      };
      return map[key] ?? key;
    }
  })
}));

// Capture the onUpdateStatus callback so tests can simulate events
let updateCallback: ((data: UpdateStatusEvent) => void) | null = null;

const mockBridge = {
  getAppVersion: vi.fn().mockResolvedValue("0.3.8"),
  onUpdateStatus: vi.fn((cb: (data: UpdateStatusEvent) => void) => {
    updateCallback = cb;
    return "listener-handle";
  }),
  removeUpdateStatus: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  checkForUpdate: vi.fn()
};

vi.mock("../lib/desktop", () => ({
  getDesktopBridge: () => mockBridge,
  isDesktopRuntime: () => true
}));

import { UpdateDialog } from "./UpdateDialog";

describe("UpdateDialog", () => {
  beforeEach(() => {
    updateCallback = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("should not render when phase is idle", () => {
    const { container } = render(<UpdateDialog />);
    expect(container.innerHTML).toBe("");
  });

  it("should show dialog when update is available", async () => {
    render(<UpdateDialog />);

    // Wait for useEffect to register listener
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(updateCallback).not.toBeNull();

    // Simulate update-available event for v0.4.0
    act(() => {
      updateCallback!({
        type: "available",
        version: "0.4.0"
      });
    });

    // Dialog should be visible
    expect(screen.getByText("Update Available")).toBeInTheDocument();
    // v0.4.0 appears in both version tag and changelog header
    expect(screen.getAllByText("v0.4.0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Current version.*0\.3\.8/)).toBeInTheDocument();
  });

  it("should display v0.4.0 changelog entries when upgrading from v0.3.8", async () => {
    render(<UpdateDialog />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      updateCallback!({
        type: "available",
        version: "0.4.0"
      });
    });

    // Changelog section should be visible
    expect(screen.getByText("What's New")).toBeInTheDocument();

    // v0.4.0 specific changes should show
    expect(screen.getAllByText("v0.4.0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Toast 通知系统/)).toBeInTheDocument();
    expect(screen.getByText(/命令面板.*Ctrl\+K/)).toBeInTheDocument();
    expect(screen.getByText(/Dashboard.*可更新实例/)).toBeInTheDocument();
    expect(screen.getByText(/批量操作/)).toBeInTheDocument();
    expect(screen.getByText(/Activity 日志增强/)).toBeInTheDocument();
    expect(screen.getByText(/library\.json 内存缓存/)).toBeInTheDocument();
    expect(screen.getByText(/自定义确认对话框/)).toBeInTheDocument();
  });

  it("should NOT show older changelog entries already applied", async () => {
    render(<UpdateDialog />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // currentVersion is 0.3.8, upgrading to 0.4.0
    // should NOT show 0.3.8 or older entries
    act(() => {
      updateCallback!({
        type: "available",
        version: "0.4.0"
      });
    });

    // Entries for 0.3.8 and below should NOT appear
    expect(screen.queryByText("修复更新对话框关闭按钮样式")).not.toBeInTheDocument();
    expect(screen.queryByText("发布初始版本")).not.toBeInTheDocument();
  });

  it("should show multiple version entries when jumping versions", async () => {
    // Simulate upgrading from 0.3.6 to 0.4.0
    mockBridge.getAppVersion.mockResolvedValue("0.3.6");

    render(<UpdateDialog />);

    // Wait for getAppVersion promise to resolve and set currentVersion
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    act(() => {
      updateCallback!({
        type: "available",
        version: "0.4.0"
      });
    });

    // Should show v0.4.0, v0.3.8, and v0.3.7 (all newer than 0.3.6)
    const changelogVersionEls = document.querySelectorAll(".update-dialog__changelog-version");
    const changelogVersions = [...changelogVersionEls].map((el) => el.textContent);
    expect(changelogVersions).toContain("v0.4.0");
    expect(changelogVersions).toContain("v0.3.8");
    expect(changelogVersions).toContain("v0.3.7");

    // Should NOT show 0.3.6 or older (already applied)
    expect(changelogVersions).not.toContain("v0.3.6");
    expect(changelogVersions).not.toContain("v0.3.5");

    // Restore default mock
    mockBridge.getAppVersion.mockResolvedValue("0.3.8");
  });
});
