import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, FileWarning, LoaderCircle, PencilLine, ChevronLeft, ChevronRight, FileText, FileX, ArrowRight } from "lucide-react";
import { api } from "../../lib/api";
import type { CommitMergeSessionResponse, MergeSessionFileDetail, MergeSessionSummary } from "../../lib/merge-types";
import { cn } from "../../lib/utils";
import { DiffView, hasContentDiff } from "../DiffView";

interface MergeConflictDialogProps {
  open: boolean;
  session: MergeSessionSummary | null;
  onClose: () => void;
  onCommitted: (response: CommitMergeSessionResponse) => Promise<void> | void;
}

function statusIcon(status: string) {
  switch (status) {
    case "conflict":
      return <FileWarning size={15} />;
    case "resolved":
      return <PencilLine size={15} />;
    default:
      return <CheckCircle2 size={15} />;
  }
}

function statusLabel(status: string, t: (key: string) => string, hasDiff?: boolean) {
  switch (status) {
    case "conflict":
      return t("merge.conflict");
    case "resolved":
      return t("merge.resolved");
    case "auto":
      return t("merge.autoMerge");
    default:
      return hasDiff ? t("merge.changed") : t("merge.unchanged");
  }
}

function effectiveStatusColor(status: string, hasDiff?: boolean) {
  if (status === "conflict") return "merge-status--conflict";
  if (status === "resolved") return "merge-status--resolved";
  if ((status === "clean" || status === "auto") && hasDiff) return "merge-status--changed";
  return "merge-status--clean";
}

export function MergeConflictDialog({ open, session, onClose, onCommitted }: MergeConflictDialogProps) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<MergeSessionSummary | null>(session);
  const [selectedPath, setSelectedPath] = useState("");
  const [detail, setDetail] = useState<MergeSessionFileDetail | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileHasDiff, setFileHasDiff] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !session) {
      setSummary(null);
      setSelectedPath("");
      setDetail(null);
      setEditorValue("");
      setError(null);
      setFileHasDiff({});
      return;
    }

    setSummary(session);
    setError(null);
    setFileHasDiff({});
    const preferred = session.files.find((file) => file.status === "conflict")?.relativePath ?? session.files[0]?.relativePath ?? "";
    setSelectedPath(preferred);

    // Preload all files to detect actual content differences
    for (const file of session.files) {
      api.getMergeSessionFile(session.sessionId, file.relativePath).then((d) => {
        const diff = hasContentDiff(d.local.text ?? "", d.target.text ?? "", d.local.exists, d.target.exists);
        setFileHasDiff((prev) => ({ ...prev, [file.relativePath]: diff }));
      }).catch(() => { /* ignore */ });
    }
  }, [open, session]);

  useEffect(() => {
    let cancelled = false;

    async function loadFileDetail() {
      if (!open || !summary?.sessionId || !selectedPath) {
        setDetail(null);
        setEditorValue("");
        return;
      }

      try {
        setLoadingDetail(true);
        const nextDetail = await api.getMergeSessionFile(summary.sessionId, selectedPath);
        if (cancelled) {
          return;
        }
        setDetail(nextDetail);
        setEditorValue(nextDetail.result.text ?? "");
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : t("errors.readFileFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      }
    }

    void loadFileDetail();
    return () => {
      cancelled = true;
    };
  }, [open, selectedPath, summary?.sessionId]);

  const currentFileSummary = useMemo(
    () => summary?.files.find((file) => file.relativePath === selectedPath) ?? null,
    [selectedPath, summary?.files]
  );

  const fileIndex = useMemo(
    () => summary?.files.findIndex((f) => f.relativePath === selectedPath) ?? -1,
    [selectedPath, summary?.files]
  );

  if (!open || !summary) {
    return null;
  }

  const goPrev = () => {
    if (fileIndex > 0) {
      setSelectedPath(summary.files[fileIndex - 1].relativePath);
    }
  };

  const goNext = () => {
    if (fileIndex < summary.files.length - 1) {
      setSelectedPath(summary.files[fileIndex + 1].relativePath);
    }
  };

  const applyResolution = async (resolution: "local" | "target" | "manual") => {
    if (!summary || !selectedPath) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const nextSummary = await api.resolveMergeSessionFile({
        sessionId: summary.sessionId,
        relativePath: selectedPath,
        resolution,
        content: resolution === "manual" ? editorValue : undefined
      });
      setSummary(nextSummary);
      const nextDetail = await api.getMergeSessionFile(summary.sessionId, selectedPath);
      setDetail(nextDetail);
      setEditorValue(nextDetail.result.text ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("merge.resolveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleCommit = async () => {
    if (!summary || summary.conflictCount > 0) {
      return;
    }

    try {
      setCommitting(true);
      setError(null);
      const response = await api.commitMergeSession({ sessionId: summary.sessionId });
      await onCommitted(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("merge.commitFailed"));
    } finally {
      setCommitting(false);
    }
  };

  const canCommit = summary.conflictCount === 0 && !committing && !saving;

  return (
    <div className="dialog-backdrop">
      <div className="dialog merge-dialog">
        {/* ───── Header ───── */}
        <header className="merge-dialog__header">
          <div className="merge-dialog__title-row">
            <h2>{summary.title}</h2>
            <p className="merge-dialog__desc">{summary.description}</p>
          </div>
          <div className="merge-dialog__stats">
            {(() => {
              const diffValues = Object.values(fileHasDiff);
              const changedCount = diffValues.filter(Boolean).length;
              const unchangedCount = diffValues.length - changedCount;
              return (
                <>
                  {changedCount > 0 && <span className="merge-stat merge-stat--changed">{changedCount} {t("merge.changed")}</span>}
                  {unchangedCount > 0 && <span className="merge-stat merge-stat--clean">{unchangedCount} {t("merge.unchanged")}</span>}
                </>
              );
            })()}
            {summary.conflictCount > 0 && (
              <span className="merge-stat merge-stat--conflict">{summary.conflictCount} {t("merge.conflict")}</span>
            )}
            {summary.resolvedCount > 0 && (
              <span className="merge-stat merge-stat--resolved">{summary.resolvedCount} {t("merge.resolved")}</span>
            )}
          </div>
        </header>

        {/* ───── Direction bar ───── */}
        <div className="merge-dialog__direction">
          <span className="merge-direction-label merge-direction-label--source">{summary.sourceLabel}</span>
          <ArrowRight size={16} className="merge-direction-arrow" />
          <span className="merge-direction-label merge-direction-label--target">{summary.targetLabel}</span>
          <span className="merge-direction-status">
            {summary.conflictCount > 0
              ? t("merge.conflictCount", { count: summary.conflictCount })
              : t("merge.canCommit")}
          </span>
        </div>

        {/* ───── Main layout ───── */}
        <div className="merge-dialog__body">
          {/* File list sidebar */}
          <aside className="merge-sidebar">
            <div className="merge-sidebar__header">
              <strong>{t("merge.files")}</strong>
              <span className="merge-sidebar__count">{summary.totalCount}</span>
            </div>
            <div className="merge-sidebar__list">
              {summary.files.map((file) => {
                const diff = fileHasDiff[file.relativePath];
                const eColor = effectiveStatusColor(file.status, diff);
                return (
                  <button
                    key={file.relativePath}
                    type="button"
                    className={cn("merge-sidebar__item", selectedPath === file.relativePath && "is-active")}
                    onClick={() => setSelectedPath(file.relativePath)}
                  >
                    <span className={cn("merge-sidebar__icon", eColor)}>
                      {statusIcon(file.status)}
                    </span>
                    <span className="merge-sidebar__name" title={file.relativePath}>{file.relativePath}</span>
                    <span className={cn("merge-sidebar__badge", eColor)}>{statusLabel(file.status, t, diff)}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Content area */}
          <main className="merge-content">
            {loadingDetail ? (
              <div className="merge-content__empty">
                <LoaderCircle size={20} className="spin" />
                <span>{t("merge.loadingFile")}</span>
              </div>
            ) : detail ? (
              <>
                {/* File navigation toolbar */}
                <div className="merge-toolbar">
                  <div className="merge-toolbar__left">
                    <button type="button" className="merge-nav-btn" onClick={goPrev} disabled={fileIndex <= 0} title={t("merge.previousFile")}>
                      <ChevronLeft size={16} />
                    </button>
                    <button type="button" className="merge-nav-btn" onClick={goNext} disabled={fileIndex >= summary.files.length - 1} title={t("merge.nextFile")}>
                      <ChevronRight size={16} />
                    </button>
                    <span className="merge-toolbar__path">
                      {detail.kind === "binary" ? <FileX size={14} /> : detail.kind === "text" ? <FileText size={14} /> : <FilePlus size={14} />}
                      <strong>{currentFileSummary?.relativePath}</strong>
                    </span>
                    <span className={cn("merge-sidebar__badge", effectiveStatusColor(currentFileSummary?.status ?? "clean", fileHasDiff[selectedPath]))}>
                      {statusLabel(currentFileSummary?.status ?? "clean", t, fileHasDiff[selectedPath])}
                    </span>
                  </div>
                  <div className="merge-toolbar__right">
                    <span className="merge-toolbar__counter">{fileIndex + 1} / {summary.files.length}</span>
                  </div>
                </div>

                {/* Diff panels */}
                {detail.kind === "text" ? (
                  <DiffView
                    left={detail.local.text ?? ""}
                    right={detail.target.text ?? ""}
                    leftLabel={t("merge.localLabel")}
                    rightLabel={t("merge.targetLabel")}
                    leftExists={detail.local.exists}
                    rightExists={detail.target.exists}
                  />
                ) : (
                  <div className="merge-diff-binary">
                    <div className="merge-diff-binary__pane">
                      <strong>LOCAL</strong>
                      <span>{detail.local.exists ? t("merge.binaryFile") : t("merge.fileNotExist")}</span>
                    </div>
                    <div className="merge-diff-binary__pane">
                      <strong>TARGET</strong>
                      <span>{detail.target.exists ? t("merge.binaryFile") : t("merge.fileNotExist")}</span>
                    </div>
                  </div>
                )}

                {/* Result editor — only show for conflict/resolved files */}
                {(currentFileSummary?.status === "conflict" || currentFileSummary?.status === "resolved") && detail.kind === "text" && (
                  <div className="merge-result">
                    <div className="merge-result__header">
                      <strong>{t("merge.mergeResult")}</strong>
                      <span>{currentFileSummary.summary}</span>
                    </div>
                    <textarea
                      className="merge-result__editor"
                      value={editorValue}
                      onChange={(e) => setEditorValue(e.target.value)}
                      rows={12}
                      spellCheck={false}
                    />
                  </div>
                )}

                {/* Action buttons */}
                {(currentFileSummary?.status === "conflict" || currentFileSummary?.status === "resolved") && (
                  <div className="merge-actions">
                    <button type="button" className="button button--ghost" onClick={() => applyResolution("local")} disabled={saving}>
                      {t("merge.keepLocal")}
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => applyResolution("target")} disabled={saving}>
                      {t("merge.adoptTarget")}
                    </button>
                    {detail?.kind === "text" && (
                      <button type="button" className="button button--primary" onClick={() => applyResolution("manual")} disabled={saving}>
                        {saving ? <LoaderCircle size={16} className="spin" /> : <PencilLine size={16} />}
                        <span>{t("merge.saveManualEdit")}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Info for clean files */}
                {currentFileSummary?.status === "clean" && (
                  <div className="merge-info">{currentFileSummary.summary}</div>
                )}
                {currentFileSummary?.status === "auto" && (
                  <div className="merge-info merge-info--auto">{currentFileSummary.summary}</div>
                )}
              </>
            ) : (
              <div className="merge-content__empty">
                <h3>{t("merge.selectFile")}</h3>
              </div>
            )}
          </main>
        </div>

        {/* ───── Error ───── */}
        {error && <div className="alert alert--error">{error}</div>}

        {/* ───── Footer ───── */}
        <footer className="merge-dialog__footer">
          <span className="merge-dialog__hint">
            {summary.conflictCount > 0
              ? t("merge.resolveFirst")
              : t("merge.allResolved")}
          </span>
          <div className="merge-dialog__footer-actions">
            <button type="button" className="button button--ghost" onClick={onClose} disabled={committing}>
              {t("common.cancel")}
            </button>
            <button type="button" className="button button--primary" onClick={handleCommit} disabled={!canCommit}>
              {committing ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}
              <span>{t("merge.commitResult")}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
