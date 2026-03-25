import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { syncApi } from "../lib/sync-api";
import type { SyncProject, SyncLogEntry, SyncLogFileChange } from "../lib/sync-types";

interface Props {
  project: SyncProject;
}

function LogDetailRow({ logId }: { logId: string }) {
  const { t } = useTranslation();
  const detailQuery = useQuery({
    queryKey: ["sync-log-details", logId],
    queryFn: () => syncApi.loadSyncLogDetails(logId),
    enabled: Boolean(logId)
  });

  const details = detailQuery.data ?? [];
  if (!details.length) return <div className="sync-log-detail-empty">{t("sync.logsNoDetails")}</div>;

  return (
    <div className="sync-log-detail-list">
      {details.map((d: SyncLogFileChange, i: number) => (
        <div key={i} className="sync-log-detail-item">
          <span className={`sync-log-action sync-log-action--${d.Action?.toLowerCase()}`}>{d.Action}</span>
          <span>{d.Path}</span>
        </div>
      ))}
    </div>
  );
}

export function SyncLogsPanel({ project }: Props) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logsQuery = useQuery({
    queryKey: ["sync-logs", project.path],
    queryFn: () => syncApi.loadSyncLogs(project.path)
  });

  const logs = logsQuery.data ?? [];

  return (
    <div className="sync-logs-panel">
      <div className="sync-logs-header">
        <h3>{t("sync.logsTitle")}</h3>
        <button className="button button--ghost" onClick={() => logsQuery.refetch()}>
          <RefreshCw size={14} /> {t("common.refresh")}
        </button>
      </div>
      <div className="sync-logs-table">
        <div className="sync-logs-table__header">
          <span className="sync-log-col--expand" />
          <span className="sync-log-col--time">{t("sync.logsTime")}</span>
          <span className="sync-log-col--op">{t("sync.logsOperation")}</span>
          <span className="sync-log-col--dir">{t("sync.logsDirection")}</span>
          <span className="sync-log-col--mode">{t("sync.logsMode")}</span>
          <span className="sync-log-col--stats">{t("sync.logsStats")}</span>
        </div>
        <div className="sync-logs-table__body">
          {logs.map((log: SyncLogEntry) => {
            const isExpanded = expandedId === log.LogId;
            return (
              <div key={log.LogId || log.Time} className="sync-log-entry">
                <div className="sync-log-row" onClick={() => setExpandedId(isExpanded ? null : log.LogId)}>
                  <span className="sync-log-col--expand">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <span className="sync-log-col--time">{new Date(log.Time).toLocaleString()}</span>
                  <span className="sync-log-col--op">{log.Operation}</span>
                  <span className="sync-log-col--dir">{log.Direction}</span>
                  <span className="sync-log-col--mode">{log.Mode}</span>
                  <span className="sync-log-col--stats">
                    {log.Copied} / {log.Overwritten} / {log.Deleted}
                  </span>
                </div>
                {isExpanded && log.LogId && <LogDetailRow logId={log.LogId} />}
              </div>
            );
          })}
          {logs.length === 0 && <div className="sync-empty-text">{t("sync.logsNoLogs")}</div>}
        </div>
      </div>
    </div>
  );
}
