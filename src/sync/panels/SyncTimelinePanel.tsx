import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, FolderOpen, RefreshCw } from "lucide-react";
import { syncApi } from "../lib/sync-api";
import type { SyncProject, AutoSyncMode } from "../lib/sync-types";

interface Props {
  project: SyncProject;
  repoPath: string;
}

const AUTO_SYNC_MODES: { value: AutoSyncMode; labelKey: string }[] = [
  { value: "RepoToProjectAll", labelKey: "sync.timelineSyncAll" },
  { value: "RepoToProjectScripts", labelKey: "sync.timelineSyncScripts" },
  { value: "ProjectToRepoAll", labelKey: "sync.timelineUpdateAll" },
  { value: "ProjectToRepoScripts", labelKey: "sync.timelineUpdateScripts" }
];

export function SyncTimelinePanel({ project, repoPath }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["sync-settings", project.path],
    queryFn: () => syncApi.loadProjectSettings(project.path)
  });

  const logsQuery = useQuery({
    queryKey: ["sync-logs", project.path],
    queryFn: () => syncApi.loadSyncLogs(project.path)
  });

  const settings = settingsQuery.data;
  const logs = logsQuery.data ?? [];

  const updateSettings = useMutation({
    mutationFn: async (newSettings: typeof settings) => {
      if (!newSettings) return;
      await syncApi.saveProjectSettings(project.path, newSettings);
      if (newSettings.AutoSyncEnabled) {
        await syncApi.startAutoSync({
          projectPath: project.path,
          repoPath,
          intervalMinutes: newSettings.AutoSyncIntervalMinutes,
          mode: newSettings.AutoSyncMode
        });
      } else {
        await syncApi.stopAutoSync(project.path);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sync-settings", project.path] })
  });

  const handleSync = async (mode: string, direction: "RepoToProject" | "ProjectToRepo") => {
    if (syncing) return;
    setSyncing(true);
    try {
      const sourceDir = direction === "RepoToProject" ? repoPath : project.path;
      const targetDir = direction === "RepoToProject" ? project.path : repoPath;
      const blacklist = await syncApi.loadBlacklist(project.path);
      await syncApi.syncFolder({
        sourceDir,
        targetDir,
        mode: mode as "All" | "Script",
        verifyContent: false,
        blacklist,
        projectPath: project.path,
        repoPath,
        operation: "manual_sync",
        direction
      });
      await queryClient.invalidateQueries({ queryKey: ["sync-logs", project.path] });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="sync-timeline-panel">
      <div className="sync-panel-card">
        <h3>{t("sync.timelineProjectInfo")}</h3>
        <div className="sync-info-grid">
          <span className="sync-info-label">{t("sync.timelineName")}</span>
          <span>{project.name}</span>
          <span className="sync-info-label">{t("sync.timelinePath")}</span>
          <span className="sync-info-path">{project.path}</span>
          <span className="sync-info-label">{t("sync.timelineRepository")}</span>
          <span className="sync-info-path">{repoPath}</span>
        </div>
        <button className="button button--ghost" onClick={() => syncApi.openInExplorer(project.path)}>
          <FolderOpen size={14} /> {t("sync.timelineOpenFolder")}
        </button>
      </div>

      <div className="sync-panel-card">
        <h3>{t("sync.timelineAutoSync")}</h3>
        {settings && (
          <div className="sync-auto-config">
            <label className="sync-toggle-row">
              <input
                type="checkbox"
                checked={settings.AutoSyncEnabled}
                onChange={(e) => updateSettings.mutate({ ...settings, AutoSyncEnabled: e.target.checked })}
              />
              <span>{t("sync.timelineEnableAutoSync")}</span>
            </label>
            <div className="sync-auto-config__row">
              <label>{t("sync.timelineInterval")}</label>
              <input
                type="number"
                min={1}
                value={settings.AutoSyncIntervalMinutes}
                onChange={(e) => updateSettings.mutate({ ...settings, AutoSyncIntervalMinutes: Math.max(1, parseInt(e.target.value) || 30) })}
              />
            </div>
            <div className="sync-auto-config__row">
              <label>{t("sync.timelineMode")}</label>
              <select
                value={settings.AutoSyncMode}
                onChange={(e) => updateSettings.mutate({ ...settings, AutoSyncMode: e.target.value as AutoSyncMode })}
              >
                {AUTO_SYNC_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="sync-panel-card">
        <h3>{t("sync.timelineManualSync")}</h3>
        <div className="sync-action-grid">
          <button className="button button--primary" disabled={syncing} onClick={() => handleSync("All", "RepoToProject")}>
            <Play size={14} /> {t("sync.timelineSyncAll")}
          </button>
          <button className="button button--primary" disabled={syncing} onClick={() => handleSync("Script", "RepoToProject")}>
            <Play size={14} /> {t("sync.timelineSyncScripts")}
          </button>
          <button className="button button--ghost" disabled={syncing} onClick={() => handleSync("All", "ProjectToRepo")}>
            <RefreshCw size={14} /> {t("sync.timelineUpdateAll")}
          </button>
          <button className="button button--ghost" disabled={syncing} onClick={() => handleSync("Script", "ProjectToRepo")}>
            <RefreshCw size={14} /> {t("sync.timelineUpdateScripts")}
          </button>
        </div>
      </div>

      <div className="sync-panel-card">
        <h3>{t("sync.timelineRecentOps")}</h3>
        <div className="sync-timeline-list">
          {logs.slice(0, 20).map((log) => (
            <div key={log.LogId || log.Time} className="sync-timeline-item">
              <div className="sync-timeline-item__dot" />
              <div className="sync-timeline-item__content">
                <span className="sync-timeline-item__op">{log.Operation} ({log.Direction})</span>
                <span className="sync-timeline-item__time">{new Date(log.Time).toLocaleString()}</span>
                <span className="sync-timeline-item__stats">
                  +{log.Copied} copied, ~{log.Overwritten} overwritten, -{log.Deleted} deleted
                </span>
              </div>
            </div>
          ))}
          {logs.length === 0 && <div className="sync-empty-text">{t("sync.timelineNoOps")}</div>}
        </div>
      </div>
    </div>
  );
}
