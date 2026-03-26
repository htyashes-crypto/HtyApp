import { useTranslation } from "react-i18next";
import { CheckCircle, X } from "lucide-react";
import type { SyncSummary, SyncDirection } from "../lib/sync-types";

interface SyncProgressDialogProps {
  open: boolean;
  direction: SyncDirection;
  progress: { done: number; total: number };
  summary: SyncSummary | null;
  onClose: () => void;
}

export function SyncProgressDialog({ open, direction, progress, summary, onClose }: SyncProgressDialogProps) {
  const { t } = useTranslation();
  if (!open) return null;

  const isDone = summary !== null;
  const pct = progress.total > 0 ? Math.round(100 * progress.done / progress.total) : 0;
  const titleKey = isDone
    ? `sync.syncProgressDoneTitle_${direction}`
    : `sync.syncProgressTitle_${direction}`;

  return (
    <div className="dialog-backdrop">
      <div className="dialog sync-progress-dialog">
        <div className="dialog__header">
          <h3 className="sync-progress-dialog__title">
            {isDone && <CheckCircle size={18} className="sync-progress-dialog__done-icon" />}
            {t(titleKey)}
          </h3>
          {isDone && (
            <button className="button button--ghost" onClick={onClose}><X size={16} /></button>
          )}
        </div>

        <div className="sync-progress-dialog__body">
          <div className="sync-progress-bar">
            <div className="sync-progress-bar__fill" style={{ width: `${isDone ? 100 : pct}%` }} />
            <div className="sync-progress-bar__text">
              {t("sync.syncProgressFiles", { done: progress.done, total: progress.total })}
            </div>
          </div>
          <div className="sync-progress-dialog__stats">
            <span>{t("sync.syncProgressFiles", { done: progress.done, total: progress.total })}</span>
            <span className="sync-progress-dialog__percent">{isDone ? 100 : pct}%</span>
          </div>

          {isDone && (
            <div className="sync-progress-dialog__summary">
              <div className="sync-progress-dialog__summary-item">
                <span className="sync-progress-dialog__summary-value" style={{ color: "var(--brand-a)" }}>
                  {summary.copied}
                </span>
                <span className="sync-progress-dialog__summary-label">
                  {t("sync.syncProgressCopied")}
                </span>
              </div>
              <div className="sync-progress-dialog__summary-item">
                <span className="sync-progress-dialog__summary-value" style={{ color: "var(--brand-b)" }}>
                  {summary.overwritten}
                </span>
                <span className="sync-progress-dialog__summary-label">
                  {t("sync.syncProgressOverwritten")}
                </span>
              </div>
              <div className="sync-progress-dialog__summary-item">
                <span className="sync-progress-dialog__summary-value" style={{ color: "var(--danger)" }}>
                  {summary.deleted}
                </span>
                <span className="sync-progress-dialog__summary-label">
                  {t("sync.syncProgressDeleted")}
                </span>
              </div>
            </div>
          )}
        </div>

        {isDone && (
          <div className="dialog__footer">
            <button className="button button--primary" onClick={onClose}>
              {t("common.close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
