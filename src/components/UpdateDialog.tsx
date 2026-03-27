import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { getDesktopBridge, type UpdateStatusEvent } from "../lib/desktop";
import { changelog, type ChangelogEntry } from "../lib/changelog";

type UpdatePhase = "idle" | "available" | "downloading" | "downloaded" | "error";

export function UpdateDialog() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [version, setVersion] = useState("");
  const [currentVersion, setCurrentVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [percent, setPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    bridge?.getAppVersion().then((v) => setCurrentVersion(v));

    if (!bridge?.onUpdateStatus) return;

    const listener = bridge.onUpdateStatus((data: UpdateStatusEvent) => {
      switch (data.type) {
        case "available":
          setPhase("available");
          setVersion(data.version ?? "");
          setReleaseNotes(data.releaseNotes ?? "");
          setDismissed(false);
          break;
        case "downloading":
          setPhase("downloading");
          setPercent(Math.round(data.percent ?? 0));
          break;
        case "downloaded":
          setPhase("downloaded");
          setVersion(data.version ?? "");
          break;
        case "error":
          setPhase("error");
          setErrorMsg(data.message ?? t("update.errorGeneric"));
          break;
        case "not-available":
          setPhase("idle");
          break;
      }
    });

    return () => { bridge.removeUpdateStatus(listener); };
  }, [t]);

  if (phase === "idle" || dismissed) return null;

  const handleDownload = () => {
    getDesktopBridge()?.downloadUpdate();
    setPhase("downloading");
    setPercent(0);
  };

  const handleInstall = () => {
    getDesktopBridge()?.quitAndInstall();
  };

  const handleDismiss = () => setDismissed(true);

  // Find changelog entries between current and new version
  const newEntries = version
    ? changelog.filter((e) => {
        if (currentVersion) {
          return compareVersions(e.version, currentVersion) > 0 && compareVersions(e.version, version) <= 0;
        }
        return compareVersions(e.version, version) <= 0;
      })
    : [];

  return (
    <div className="dialog-backdrop" onClick={handleDismiss}>
      <div className="dialog update-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dialog__header">
          <h3>{t("update.title")}</h3>
          <button type="button" className="update-dialog__close" onClick={handleDismiss}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="dialog__body update-dialog__body">
          {/* Version info */}
          <div className="update-dialog__version-info">
            <span className="update-dialog__version-tag">v{version}</span>
            <span className="update-dialog__version-hint">
              {t("update.currentVersion")} v{currentVersion}
            </span>
          </div>

          {/* Status */}
          {phase === "downloaded" && (
            <div className="update-dialog__status update-dialog__status--ready">
              <RefreshCw size={14} />
              <span>{t("update.readyToInstall", { version })}</span>
            </div>
          )}

          {phase === "downloading" && (
            <div className="update-dialog__progress">
              <div className="update-dialog__progress-info">
                <span>{t("update.downloading")}</span>
                <span>{percent}%</span>
              </div>
              <div className="update-dialog__progress-track">
                <div className="update-dialog__progress-bar" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="update-dialog__status update-dialog__status--error">
              <span>{t("update.errorLabel")}: {errorMsg}</span>
              <button type="button" className="button button--ghost button--sm" onClick={() => navigator.clipboard.writeText(errorMsg)}>
                {t("update.copy")}
              </button>
            </div>
          )}

          {/* Changelog */}
          {newEntries.length > 0 && (
            <div className="update-dialog__changelog">
              <h4>{t("update.changelog")}</h4>
              {newEntries.map((entry) => (
                <ChangelogSection key={entry.version} entry={entry} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="dialog__footer">
          <div className="update-dialog__footer-left">
            {phase === "available" && (
              <button type="button" className="button button--ghost" onClick={handleDismiss}>
                {t("update.later")}
              </button>
            )}
            {phase === "downloaded" && (
              <button type="button" className="button button--ghost" onClick={handleDismiss}>
                {t("update.later")}
              </button>
            )}
            {phase === "error" && (
              <button type="button" className="button button--ghost" onClick={handleDismiss}>
                {t("update.close")}
              </button>
            )}
          </div>
          <div className="update-dialog__footer-right">
            {phase === "available" && (
              <button type="button" className="button button--primary" onClick={handleDownload}>
                <Download size={14} /> {t("update.download")}
              </button>
            )}
            {phase === "downloading" && (
              <button type="button" className="button button--primary" disabled>
                <Loader2 size={14} className="spin" /> {t("update.downloading")}
              </button>
            )}
            {phase === "downloaded" && (
              <button type="button" className="button button--primary" onClick={handleInstall}>
                <RotateCcw size={14} /> {t("update.installNow")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangelogSection({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="update-dialog__changelog-section">
      <div className="update-dialog__changelog-header">
        <span className="update-dialog__changelog-version">v{entry.version}</span>
        <span className="update-dialog__changelog-date">{entry.date}</span>
      </div>
      <ul className="update-dialog__changelog-list">
        {entry.changes.map((change, i) => (
          <li key={i}>{change}</li>
        ))}
      </ul>
    </div>
  );
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}
