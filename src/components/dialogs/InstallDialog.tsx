import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Download, LoaderCircle, Search } from "lucide-react";
import { api } from "../../lib/api";
import {
  getDefaultInstallProviders,
  getInstallableProviders,
  toggleProvider
} from "../../lib/provider-selection";
import type { GlobalSkillSummary, Provider, WorkspaceRecord } from "../../lib/types";
import { providerLabel } from "../../lib/utils";
import { ProviderPills } from "../shared/ProviderPills";

const SPECIAL_PROVIDER_ROOTS: Record<Provider, string> = {
  codex: "C:/Users/admin/.codex/skills",
  claude: "C:/Users/admin/.claude/skills",
  cursor: "C:/Users/admin/.cursor/skills-cursor"
};

interface InstallDialogProps {
  open: boolean;
  library: GlobalSkillSummary[];
  initialSkillId: string | null;
  workspace: WorkspaceRecord | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function InstallDialog({ open, library, initialSkillId, workspace, onClose, onSuccess }: InstallDialogProps) {
  const { t } = useTranslation();
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredLibrary = useMemo(() => {
    const needle = skillSearch.trim().toLowerCase();
    if (!needle) return library;
    return library.filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) ||
        skill.description.toLowerCase().includes(needle) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(needle))
    );
  }, [library, skillSearch]);

  useEffect(() => {
    if (!open) return;
    const fallbackSkillId =
      (initialSkillId && library.some((skill) => skill.skillId === initialSkillId) ? initialSkillId : null) ||
      library[0]?.skillId || "";
    setSelectedSkillId(fallbackSkillId);
    setSkillSearch("");
    setSelectedVersion("");
    setProviders([]);
    setError(null);
  }, [open, initialSkillId, library]);

  useEffect(() => {
    if (!open || !library.length) return;
    if (!selectedSkillId || !library.some((skill) => skill.skillId === selectedSkillId)) {
      setSelectedSkillId(filteredLibrary[0]?.skillId || library[0]?.skillId || "");
    }
  }, [filteredLibrary, library, open, selectedSkillId]);

  const skillDetailQuery = useQuery({
    queryKey: ["install-skill-detail", selectedSkillId],
    enabled: open && Boolean(selectedSkillId),
    queryFn: () => api.getSkillDetail(selectedSkillId)
  });

  const selectedSkillSummary = library.find((skill) => skill.skillId === selectedSkillId) ?? null;
  const skillDetail = skillDetailQuery.data ?? null;
  const versionRecord = useMemo(
    () => skillDetail?.versions.find((item) => item.version === selectedVersion) ?? skillDetail?.versions[0] ?? null,
    [selectedVersion, skillDetail]
  );

  const installableProviders = useMemo(() => {
    const versionProviders = versionRecord?.providers.map((item) => item.provider) ?? [];
    return getInstallableProviders(versionProviders, workspace);
  }, [versionRecord, workspace]);

  useEffect(() => {
    if (!open || !skillDetail) return;
    const fallbackVersion = skillDetail.versions[0]?.version ?? "";
    setSelectedVersion((current) =>
      current && skillDetail.versions.some((version) => version.version === current) ? current : fallbackVersion
    );
    setError(null);
  }, [open, skillDetail]);

  useEffect(() => {
    if (!installableProviders.length) { setProviders([]); return; }
    setProviders(getDefaultInstallProviders(installableProviders));
  }, [installableProviders]);

  if (!open || !workspace) return null;

  const handleSubmit = async () => {
    if (!versionRecord || !selectedSkillId || !providers.length) return;
    try {
      setSubmitting(true);
      setError(null);
      await api.installFromGlobal({
        workspaceRoot: workspace.rootPath,
        skillId: selectedSkillId,
        version: versionRecord.version,
        providers
      });
      onSuccess();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("install.installFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog dialog--wide">
        <div className="dialog__header">
          <div>
            <h3>{t("install.title")}</h3>
            <p>{t("install.description")}</p>
          </div>
          <button type="button" className="button button--ghost" onClick={onClose}>{t("common.close")}</button>
        </div>

        <div className="dialog__body">
          <div className="dialog__summary">
            <div>
              <span className="dialog__label">{t("install.targetWorkspace")}</span>
              <strong>{workspace.name}</strong>
            </div>
            <div>
              <span className="dialog__label">{t("install.workspacePath")}</span>
              <strong>{workspace.kind === "special" ? t("install.autoMap") : workspace.rootPath}</strong>
            </div>
          </div>

          {workspace.kind === "special" ? (
            <div className="dialog__summary">
              <div>
                <span className="dialog__label">{t("install.specialRule")}</span>
                <strong>{t("install.specialRuleDesc")}</strong>
              </div>
            </div>
          ) : null}

          {library.length ? (
            <div className="dialog__install-layout">
              <section className="dialog__install-pane">
                <label className="dialog__install-search">
                  <Search size={15} />
                  <input value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder={t("install.search")} />
                </label>
                <div className="dialog__install-skill-list">
                  {filteredLibrary.length ? (
                    filteredLibrary.map((skill) => (
                      <button
                        key={skill.skillId}
                        type="button"
                        className={`list-card list-card--interactive dialog__install-skill ${selectedSkillId === skill.skillId ? "is-active" : ""}`}
                        onClick={() => setSelectedSkillId(skill.skillId)}
                      >
                        <div>
                          <h4>{skill.name}</h4>
                          <p>{skill.description || t("install.noDescription")}</p>
                        </div>
                        <div className="list-card__meta">
                          <span>{skill.latestVersion || t("common.unpublished")}</span>
                          <ProviderPills providers={skill.latestProviders} compact />
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="projects-instance-table__empty">{t("install.noSkill")}</div>
                  )}
                </div>
              </section>

              <section className="dialog__install-pane dialog__install-pane--detail">
                {skillDetailQuery.isLoading ? (
                  <div className="empty-state">
                    <h3>{t("install.loadingSkill")}</h3>
                    <p>{t("install.loadingDesc")}</p>
                  </div>
                ) : skillDetail && selectedSkillSummary ? (
                  <>
                    <div className="detail-card detail-card--vertical">
                      <div>
                        <span className="detail-card__label">{t("install.logicSkill")}</span>
                        <strong>{selectedSkillSummary.name}</strong>
                      </div>
                      <div>
                        <span className="detail-card__label">{t("install.skillDescription")}</span>
                        <strong>{selectedSkillSummary.description || t("install.noDescription")}</strong>
                      </div>
                    </div>

                    <label>
                      <span className="dialog__label">{t("common.version")}</span>
                      <select value={selectedVersion} onChange={(event) => setSelectedVersion(event.target.value)}>
                        {skillDetail.versions.map((version) => (
                          <option key={version.version} value={version.version}>
                            {version.version} · {version.notes || t("install.noDescription")}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div>
                      <span className="dialog__label">{t("install.installProvider")}</span>
                      {installableProviders.length ? (
                        <div className="checkbox-grid">
                          {installableProviders.map((provider) => (
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
                      ) : (
                        <div className="projects-instance-table__empty">{t("install.noInstallableProvider")}</div>
                      )}
                    </div>

                    <div className="dialog__targets">
                      <span className="dialog__label">{t("install.targetDirectory")}</span>
                      <ul>
                        {(versionRecord?.providers ?? [])
                          .filter((variant) => providers.includes(variant.provider))
                          .map((variant) => (
                            <li key={variant.provider}>
                              <strong>{providerLabel(variant.provider)}</strong>
                              <span>
                                {workspace.kind === "special"
                                  ? `${SPECIAL_PROVIDER_ROOTS[variant.provider]}/${variant.displayName}`
                                  : variant.displayName}
                              </span>
                            </li>
                          ))}
                      </ul>
                      <p className="dialog__hint">{t("install.backupBefore")}</p>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <h3>{t("install.unableToRead")}</h3>
                    <p>{t("install.unableToReadDesc")}</p>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="empty-state">
              <h3>{t("install.globalLibraryEmpty")}</h3>
              <p>{t("install.globalLibraryEmptyDesc")}</p>
            </div>
          )}

          {error ? <div className="alert alert--error">{error}</div> : null}
        </div>

        <div className="dialog__footer">
          <button type="button" className="button button--ghost" onClick={onClose}>{t("common.cancel")}</button>
          <button
            type="button"
            className="button button--primary"
            onClick={handleSubmit}
            disabled={submitting || !library.length || !selectedSkillId || !versionRecord || !providers.length}
          >
            {submitting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
            <span>{t("install.confirmInstall")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
