import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoaderCircle, Plus, Send } from "lucide-react";
import { api } from "../../lib/api";
import { getDefaultPublishProviders, toggleProvider } from "../../lib/provider-selection";
import type { MergeSessionSummary } from "../../lib/merge-types";
import type { GlobalSkillSummary, LocalInstance, Provider, PublishMode } from "../../lib/types";
import { providerLabel } from "../../lib/utils";
import { useUiStore } from "../../state/ui-store";

interface PublishDialogProps {
  open: boolean;
  instance: LocalInstance | null;
  workspaceRoot: string | null;
  library: GlobalSkillSummary[];
  onClose: () => void;
  onSuccess: () => void;
  onOpenMergeSession: (session: MergeSessionSummary) => void;
}

export function PublishDialog({
  open,
  instance,
  workspaceRoot,
  library,
  onClose,
  onSuccess,
  onOpenMergeSession
}: PublishDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PublishMode>("create");
  const [providers, setProviders] = useState<Provider[]>(getDefaultPublishProviders());
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [existingSkillId, setExistingSkillId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !instance) {
      initializedSessionRef.current = null;
      return;
    }

    const sessionKey = `${workspaceRoot ?? ""}:${instance.instanceId}`;
    if (initializedSessionRef.current === sessionKey) {
      return;
    }

    initializedSessionRef.current = sessionKey;
    setMode(instance.linkedSkillId ? "append" : "create");
    setProviders(getDefaultPublishProviders());
    setName(instance.displayName);
    setSlug(instance.displayName);
    setDescription("");
    setTags("");
    setNotes("");
    setExistingSkillId(instance.linkedSkillId || library[0]?.skillId || "");
    setError(null);
  }, [instance?.instanceId, library, open, workspaceRoot]);

  useEffect(() => {
    if (!open || !instance?.linkedSkillId || existingSkillId || !library.length) {
      return;
    }

    setExistingSkillId(instance.linkedSkillId || library[0]?.skillId || "");
  }, [existingSkillId, instance?.linkedSkillId, library, open]);

  const selectedLibrarySkill = useMemo(
    () => library.find((item) => item.skillId === existingSkillId) ?? null,
    [existingSkillId, library]
  );

  if (!open || !instance || !workspaceRoot) {
    return null;
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);

      if (mode === "append") {
        const preview = await api.prepareAppendPublishMerge({
          workspaceRoot,
          instanceId: instance.instanceId,
          providers,
          skillMode: "append",
          existingSkillId,
          notes
        });

        if (preview.action === "noop") {
          setError(preview.message);
          return;
        }

        const { autoApprove } = useUiStore.getState();

        if (preview.action === "needs_resolution" || !autoApprove) {
          onOpenMergeSession(preview);
          onClose();
          return;
        }

        await api.commitMergeSession({ sessionId: preview.sessionId });
        onSuccess();
        onClose();
        return;
      }

      await api.publishToGlobal({
        workspaceRoot,
        instanceId: instance.instanceId,
        providers,
        skillMode: "create",
        name,
        slug,
        description,
        tags: tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        notes
      });
      onSuccess();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("publish.uploadFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog dialog--wide">
        <div className="dialog__header">
          <div>
            <h3>{t("publish.title")}</h3>
            <p>{mode === "append" ? t("publish.appendDesc") : t("publish.createDesc")}</p>
          </div>
          <button type="button" className="button button--ghost" onClick={onClose}>{t("common.close")}</button>
        </div>

        <div className="dialog__body">
          <div className="dialog__summary">
            <div>
              <span className="dialog__label">{t("publish.sourceInstance")}</span>
              <strong>{instance.displayName}</strong>
            </div>
            <div>
              <span className="dialog__label">{t("publish.currentBinding")}</span>
              <strong>{instance.linkedVersion || t("publish.notBound")}</strong>
            </div>
          </div>

          <div className="segmented-control">
            <button type="button" className={mode === "create" ? "is-active" : ""} onClick={() => setMode("create")}>
              <Plus size={16} />
              <span>{t("publish.createNew")}</span>
            </button>
            <button type="button" className={mode === "append" ? "is-active" : ""} onClick={() => setMode("append")}>
              <Send size={16} />
              <span>{t("publish.appendExisting")}</span>
            </button>
          </div>

          {mode === "create" ? (
            <div className="dialog__grid">
              <label>
                <span>{t("publish.name")}</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span>{t("publish.slug")}</span>
                <input value={slug} onChange={(event) => setSlug(event.target.value)} />
              </label>
              <label className="dialog__grid--full">
                <span>{t("publish.descriptionLabel")}</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
              </label>
              <label className="dialog__grid--full">
                <span>{t("publish.tagsLabel")}</span>
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t("publish.tagsPlaceholder")} />
              </label>
            </div>
          ) : (
            <label>
              <span className="dialog__label">{t("publish.appendTarget")}</span>
              <select value={existingSkillId} onChange={(event) => setExistingSkillId(event.target.value)}>
                {library.map((skill) => (
                  <option key={skill.skillId} value={skill.skillId}>
                    {skill.name} {skill.latestVersion ? `(${skill.latestVersion})` : ""}
                  </option>
                ))}
              </select>
              {selectedLibrarySkill ? (
                <p className="dialog__hint">{t("publish.compareHint", { name: selectedLibrarySkill.name })}</p>
              ) : null}
            </label>
          )}

          <div>
            <span className="dialog__label">{t("publish.targetProvider")}</span>
            <div className="checkbox-grid">
              {(["codex", "claude", "cursor"] as Provider[]).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className={`checkbox-pill ${providers.includes(provider) ? "is-active" : ""}`}
                  onClick={() => setProviders((current) => toggleProvider(current, provider))}
                >
                  {providerLabel(provider)}
                </button>
              ))}
            </div>
          </div>

          <label>
            <span className="dialog__label">{t("publish.versionNotes")}</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </label>

          {error ? <div className="alert alert--error">{error}</div> : null}
        </div>

        <div className="dialog__footer">
          <button type="button" className="button button--ghost" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="button button--primary" onClick={handleSubmit} disabled={submitting || (mode === "append" && !existingSkillId)}>
            {submitting ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
            <span>{mode === "append" ? t("publish.analyzeUpload") : t("publish.confirmUpload")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
