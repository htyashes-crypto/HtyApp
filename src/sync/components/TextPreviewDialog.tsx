import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  text: string;
  onClose: () => void;
}

export function TextPreviewDialog({ open, title, text, onClose }: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  const lines = text.replace(/\r\n/g, "\n").split("\n");

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog text-preview-dialog">
        <div className="dialog__header">
          <h2>{title}</h2>
          <button type="button" className="button button--ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="text-preview__body">
          {lines.map((line, idx) => (
            <div key={idx} className="text-preview__line">
              <span className="text-preview__num">{idx + 1}</span>
              <span className="text-preview__text">{line}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
