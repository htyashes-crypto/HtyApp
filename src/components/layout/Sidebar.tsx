import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  LibraryBig,
  Search,
  Store,
  PenTool
} from "lucide-react";
import type { RouteKey, WorkspaceRecord } from "../../lib/types";

interface SidebarProps {
  route: RouteKey;
  search: string;
  onSearchChange: (value: string) => void;
  workspaces: WorkspaceRecord[];
  selectedWorkspaceId: string | null;
  currentWorkspaceInstanceCount: number;
  onRouteChange: (route: RouteKey) => void;
  onSelectWorkspace: (workspaceId: string) => void;
}

export function Sidebar({
  route,
  search,
  onSearchChange,
  workspaces,
  selectedWorkspaceId,
  currentWorkspaceInstanceCount,
  onRouteChange,
  onSelectWorkspace
}: SidebarProps) {
  const { t } = useTranslation();
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  const routes: Array<{ key: RouteKey; label: string; icon: typeof LayoutDashboard }> = [
    { key: "overview", label: t("sidebar.overview"), icon: LayoutDashboard },
    { key: "library", label: t("sidebar.library"), icon: LibraryBig },
    { key: "market", label: t("sidebar.market"), icon: Store },
    { key: "composer", label: t("sidebar.composer"), icon: PenTool },
    { key: "activity", label: t("sidebar.activity"), icon: Activity }
  ];

  return (
    <aside className="sidebar">
      {route === "projects" ? (
        <label className="sidebar__search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("sidebar.search")}
          />
        </label>
      ) : null}

      <div className="sidebar__section-label">{t("sidebar.navigation")}</div>
      <nav className="sidebar__nav">
        {routes.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={`sidebar__nav-item ${route === key ? "is-active" : ""}`}
            onClick={() => onRouteChange(key)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__workspace-section">
        <button
          type="button"
          className="sidebar__workspace-toggle"
          onClick={() => setWorkspaceOpen((value) => !value)}
        >
          <span className="sidebar__section-label">{t("sidebar.workspace")}</span>
          {workspaceOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {workspaceOpen ? (
          <div className="sidebar__workspace-list">
            {workspaces.length ? (
              workspaces.map((workspace) => (
                <button
                  key={workspace.workspaceId}
                  type="button"
                  className={`sidebar__workspace-item ${selectedWorkspaceId === workspace.workspaceId ? "is-active" : ""}`}
                  onClick={() => {
                    onSelectWorkspace(workspace.workspaceId);
                    onRouteChange("projects");
                  }}
                >
                  <strong>{workspace.kind === "special" ? `${workspace.name} · ${t("overview.special")}` : workspace.name}</strong>
                  <span>
                    {workspace.kind === "special"
                      ? workspace.availableProviders.length
                        ? workspace.availableProviders.join(" / ")
                        : t("overview.noProvider")
                      : workspace.rootPath}
                  </span>
                </button>
              ))
            ) : (
              <div className="sidebar__workspace-empty">{t("sidebar.noWorkspace")}</div>
            )}
          </div>
        ) : null}
      </div>

      <div className="sidebar__footer">
        <div className="sidebar__workspace-summary">
          <span className="sidebar__workspace-summary-label">{t("sidebar.currentProjectIndex")}</span>
          <div className="sidebar__workspace-summary-row">
            <strong>{currentWorkspaceInstanceCount}</strong>
            <span>{t("sidebar.instances")}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
