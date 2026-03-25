import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { DiffView } from "../../components/DiffView";

interface Props {
  open: boolean;
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftText: string;
  rightText: string;
  readOnly: boolean;
  onClose: () => void;
  onResolve?: (keepProject: boolean) => void;
}

export function DiffViewerDialog({ open, title, leftLabel, rightLabel, leftText, rightText, readOnly, onClose, onResolve }: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog diff-viewer-dialog">
        <header className="diff-viewer-dialog__header">
          <h2>{title}</h2>
          <button type="button" className="button button--ghost" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="diff-viewer-dialog__body">
          <DiffView
            left={leftText}
            right={rightText}
            leftLabel={leftLabel}
            rightLabel={rightLabel}
            leftExists={true}
            rightExists={true}
          />
        </div>
        <footer className="diff-viewer-dialog__footer">
          {!readOnly && onResolve && (
            <>
              <span className="diff-viewer-dialog__hint">{t("sync.chooseWhichSide")}</span>
              <button className="button button--primary" onClick={() => onResolve(false)}>
                {t("sync.keepRepo")}
              </button>
              <button className="button button--primary" onClick={() => onResolve(true)}>
                {t("sync.keepProject")}
              </button>
            </>
          )}
          <button className="button button--ghost" onClick={onClose}>{t("common.cancel")}</button>
        </footer>
      </div>
    </div>
  );
}
