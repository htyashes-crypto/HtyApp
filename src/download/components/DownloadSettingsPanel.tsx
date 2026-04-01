import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X, FolderOpen } from "lucide-react";
import { downloadApi } from "../lib/download-api";
import { getDesktopBridge } from "../../lib/desktop";
import { toast } from "../../state/toast-store";
import type { DownloadSettings } from "../lib/download-types";

interface DownloadSettingsPanelProps {
  settings: DownloadSettings;
  onClose: () => void;
}

export function DownloadSettingsPanel({ settings, onClose }: DownloadSettingsPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [defaultSaveDir, setDefaultSaveDir] = useState(settings.defaultSaveDir);
  const [maxConcurrent, setMaxConcurrent] = useState(settings.maxConcurrentDownloads);
  const [defaultSegments, setDefaultSegments] = useState(settings.defaultSegmentCount);
  const [speedLimit, setSpeedLimit] = useState(settings.speedLimitKBps);
  const [autoStart, setAutoStart] = useState(settings.autoStartDownloads);

  const saveMutation = useMutation({
    mutationFn: () =>
      downloadApi.saveSettings({
        defaultSaveDir,
        maxConcurrentDownloads: maxConcurrent,
        defaultSegmentCount: defaultSegments,
        speedLimitKBps: speedLimit,
        autoStartDownloads: autoStart
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["download-settings"] });
      toast("success", t("common.save"));
      onClose();
    }
  });

  const handleBrowse = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const result = await bridge.openDialog({ directory: true, title: t("download.defaultSaveDir") });
    if (result && typeof result === "string") {
      setDefaultSaveDir(result);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dl-settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <h3>{t("download.settingsTitle")}</h3>
          <button className="button button--ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="dialog__body">
          <div className="dl-settings__field">
            <label>{t("download.defaultSaveDir")}</label>
            <div className="dl-settings__path-row">
              <input type="text" value={defaultSaveDir} onChange={(e) => setDefaultSaveDir(e.target.value)} />
              <button className="button button--ghost" onClick={handleBrowse}>
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          <div className="dl-settings__field">
            <label>{t("download.maxConcurrent")}</label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
            />
          </div>

          <div className="dl-settings__field">
            <label>{t("download.defaultSegments")}</label>
            <input
              type="number"
              min={1}
              max={16}
              value={defaultSegments}
              onChange={(e) => setDefaultSegments(Number(e.target.value))}
            />
          </div>

          <div className="dl-settings__field">
            <label>{t("download.speedLimit")}</label>
            <input
              type="number"
              min={0}
              value={speedLimit}
              onChange={(e) => setSpeedLimit(Number(e.target.value))}
            />
          </div>

          <div className="dl-settings__field dl-settings__field--check">
            <label>
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
              />
              {t("download.autoStart")}
            </label>
          </div>
        </div>

        <div className="dialog__footer">
          <button className="button" onClick={onClose}>{t("common.cancel")}</button>
          <button
            className="button button--primary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
