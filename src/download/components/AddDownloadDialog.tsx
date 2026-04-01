import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X, FolderOpen } from "lucide-react";
import { downloadApi } from "../lib/download-api";
import { getDesktopBridge } from "../../lib/desktop";
import { toast } from "../../state/toast-store";

interface AddDownloadDialogProps {
  defaultSaveDir: string;
  defaultSegments: number;
  onClose: () => void;
}

export function AddDownloadDialog({ defaultSaveDir, defaultSegments, onClose }: AddDownloadDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [segmentCount, setSegmentCount] = useState(defaultSegments);

  const createMutation = useMutation({
    mutationFn: () => {
      const savePath = fileName ? `${saveDir}/${fileName}`.replace(/\\/g, "/").replace(/\/\//g, "/") : undefined;
      return downloadApi.create({
        url: url.trim(),
        fileName: fileName || undefined,
        savePath,
        segmentCount
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
      onClose();
    },
    onError: (err) => {
      toast("error", (err as Error).message || t("download.probeFailed"));
    }
  });

  const handleBrowse = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const result = await bridge.openDialog({ directory: true, title: t("download.saveTo") });
    if (result && typeof result === "string") {
      setSaveDir(result);
    }
  };

  const canSubmit = url.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dl-add-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <h3>{t("download.addUrl")}</h3>
          <button className="button button--ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="dialog__body">
          <div className="dl-add-dialog__field">
            <label>URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("download.urlPlaceholder")}
              autoFocus
            />
          </div>

          <div className="dl-add-dialog__field">
            <label>{t("download.fileName")}</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={t("download.fileName")}
            />
          </div>

          <div className="dl-add-dialog__field">
            <label>{t("download.saveTo")}</label>
            <div className="dl-add-dialog__path-row">
              <input type="text" value={saveDir} onChange={(e) => setSaveDir(e.target.value)} />
              <button className="button button--ghost" onClick={handleBrowse}>
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          <div className="dl-add-dialog__field">
            <label>{t("download.segments")}</label>
            <div className="dl-add-dialog__segments-row">
              <input
                type="range"
                min={1}
                max={16}
                value={segmentCount}
                onChange={(e) => setSegmentCount(Number(e.target.value))}
              />
              <span className="dl-add-dialog__segments-val">{segmentCount}</span>
            </div>
          </div>
        </div>

        <div className="dialog__footer">
          <button className="button" onClick={onClose}>{t("common.cancel")}</button>
          <button
            className="button button--primary"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
          >
            {createMutation.isPending ? t("common.processing") : t("download.startDownload")}
          </button>
        </div>
      </div>
    </div>
  );
}
