import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Pause,
  Play,
  X,
  RotateCcw,
  Trash2,
  FolderOpen,
  FileText,
  AlertCircle
} from "lucide-react";
import { downloadApi } from "../lib/download-api";
import { confirm } from "../../state/confirm-store";
import type { DownloadItem } from "../lib/download-types";

function formatBytes(bytes: number): string {
  if (bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "—";
  return formatBytes(bytesPerSec) + "/s";
}

function formatEta(downloadedBytes: number, totalBytes: number, speed: number): string {
  if (speed <= 0 || totalBytes <= 0) return "—";
  const remaining = totalBytes - downloadedBytes;
  if (remaining <= 0) return "0s";
  const seconds = Math.ceil(remaining / speed);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

interface DownloadItemCardProps {
  item: DownloadItem;
}

export function DownloadItemCard({ item }: DownloadItemCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["downloads"] });

  const pauseMutation = useMutation({ mutationFn: () => downloadApi.pause(item.id), onSuccess: invalidate });
  const resumeMutation = useMutation({ mutationFn: () => downloadApi.resume(item.id), onSuccess: invalidate });
  const retryMutation = useMutation({ mutationFn: () => downloadApi.retry(item.id), onSuccess: invalidate });

  const cancelMutation = useMutation({
    mutationFn: () => downloadApi.cancel(item.id),
    onSuccess: invalidate
  });

  const deleteMutation = useMutation({
    mutationFn: (deleteFile: boolean) => downloadApi.delete(item.id, deleteFile),
    onSuccess: invalidate
  });

  const handleCancel = async () => {
    const ok = await confirm(t("download.cancelConfirm"), "", false);
    if (ok) cancelMutation.mutate();
  };

  const handleDelete = async () => {
    const ok = await confirm(t("download.deleteConfirm"), t("download.deleteFile"), false);
    if (ok) deleteMutation.mutate(true);
  };

  const percent = item.totalBytes > 0 ? Math.min(100, Math.round((item.downloadedBytes / item.totalBytes) * 100)) : 0;
  const isActive = item.status === "downloading";
  const isDone = item.status === "completed";
  const isFailed = item.status === "failed";
  const isPaused = item.status === "paused";

  return (
    <div className={`dl-card dl-card--${item.status}`}>
      <div className="dl-card__header">
        <div className="dl-card__name" title={item.fileName}>
          <FileText size={14} />
          <span>{item.fileName}</span>
        </div>
        <div className="dl-card__meta">
          {isActive && <span className="dl-card__speed">{formatSpeed(item.speed)}</span>}
          {isActive && item.totalBytes > 0 && (
            <span className="dl-card__eta">{formatEta(item.downloadedBytes, item.totalBytes, item.speed)}</span>
          )}
          {isDone && <span className="dl-card__time">{formatTime(item.completedAt)}</span>}
          <span className="dl-card__size">
            {item.totalBytes > 0 ? `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}` : formatBytes(item.downloadedBytes)}
          </span>
          {!isDone && item.totalBytes > 0 && <span className="dl-card__percent">{percent}%</span>}
        </div>
      </div>

      {/* Overall progress bar */}
      {!isDone && item.totalBytes > 0 && (
        <div className="dl-card__progress">
          <div className="dl-card__progress-bar" style={{ width: `${percent}%` }} />
        </div>
      )}

      {/* Segment visualization */}
      {isActive && item.segments.length > 1 && (
        <div className="dl-card__segments">
          {item.segments.map((seg) => {
            const segTotal = seg.endByte - seg.startByte + 1;
            const segPercent = segTotal > 0 ? Math.round((seg.downloadedBytes / segTotal) * 100) : 0;
            return (
              <div key={seg.index} className="dl-card__segment" style={{ flex: segTotal }}>
                <div className="dl-card__segment-fill" style={{ width: `${segPercent}%` }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Error message */}
      {isFailed && item.error && (
        <div className="dl-card__error">
          <AlertCircle size={12} />
          <span>{item.error}</span>
        </div>
      )}

      {/* Status label for non-active states */}
      {!isActive && !isDone && !isFailed && (
        <div className="dl-card__status-label">
          {t(`download.status_${item.status}`)}
        </div>
      )}

      {/* Actions */}
      <div className="dl-card__actions">
        {isActive && (
          <button className="button button--ghost button--sm" onClick={() => pauseMutation.mutate()} title={t("download.pause")}>
            <Pause size={13} />
          </button>
        )}
        {(isPaused || isFailed) && (
          <button className="button button--ghost button--sm" onClick={() => resumeMutation.mutate()} title={t("download.resume")}>
            <Play size={13} />
          </button>
        )}
        {isFailed && (
          <button className="button button--ghost button--sm" onClick={() => retryMutation.mutate()} title={t("download.retry")}>
            <RotateCcw size={13} />
          </button>
        )}
        {(isActive || isPaused || item.status === "pending") && (
          <button className="button button--ghost button--sm" onClick={handleCancel} title={t("download.cancel")}>
            <X size={13} />
          </button>
        )}
        {isDone && (
          <>
            <button className="button button--ghost button--sm" onClick={() => downloadApi.openFile(item.savePath)} title={t("download.openFile")}>
              <FileText size={13} />
            </button>
            <button className="button button--ghost button--sm" onClick={() => downloadApi.revealFile(item.savePath)} title={t("download.revealFile")}>
              <FolderOpen size={13} />
            </button>
          </>
        )}
        {(isDone || item.status === "cancelled") && (
          <button className="button button--ghost button--sm" onClick={handleDelete} title={t("download.delete")}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
