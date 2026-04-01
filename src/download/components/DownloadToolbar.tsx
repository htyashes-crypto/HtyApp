import { useTranslation } from "react-i18next";
import { Plus, Pause, Play, Trash2, Settings, Search } from "lucide-react";
import { useDownloadStore } from "../state/download-store";
import type { DownloadFilterStatus } from "../lib/download-types";

interface DownloadToolbarProps {
  onAdd: () => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onClearCompleted: () => void;
  onOpenSettings: () => void;
}

const FILTERS: { key: DownloadFilterStatus; labelKey: string }[] = [
  { key: "all", labelKey: "download.filterAll" },
  { key: "downloading", labelKey: "download.filterDownloading" },
  { key: "paused", labelKey: "download.filterPaused" },
  { key: "completed", labelKey: "download.filterCompleted" },
  { key: "failed", labelKey: "download.filterFailed" }
];

export function DownloadToolbar({ onAdd, onPauseAll, onResumeAll, onClearCompleted, onOpenSettings }: DownloadToolbarProps) {
  const { t } = useTranslation();
  const { filterStatus, setFilterStatus, searchQuery, setSearchQuery } = useDownloadStore();

  return (
    <div className="dl-toolbar">
      <div className="dl-toolbar__actions">
        <button className="button button--primary" onClick={onAdd}>
          <Plus size={14} />
          {t("download.addUrl")}
        </button>
        <button className="button button--ghost" onClick={onPauseAll} title={t("download.pauseAll")}>
          <Pause size={14} />
        </button>
        <button className="button button--ghost" onClick={onResumeAll} title={t("download.resumeAll")}>
          <Play size={14} />
        </button>
        <button className="button button--ghost" onClick={onClearCompleted} title={t("download.clearCompleted")}>
          <Trash2 size={14} />
        </button>
        <button className="button button--ghost" onClick={onOpenSettings} title={t("download.settings")}>
          <Settings size={14} />
        </button>
      </div>

      <div className="dl-toolbar__filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`dl-toolbar__filter-btn${filterStatus === f.key ? " is-active" : ""}`}
            onClick={() => setFilterStatus(f.key)}
          >
            {t(f.labelKey)}
          </button>
        ))}

        <div className="dl-toolbar__search">
          <Search size={13} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("download.urlPlaceholder")}
          />
        </div>
      </div>
    </div>
  );
}
