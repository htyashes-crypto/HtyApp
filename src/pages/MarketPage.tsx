import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, Check, Loader2, Upload } from "lucide-react";
import { api } from "../lib/api";
import type {
  GlobalSkillSummary,
  MarketDownloadRequest,
  MarketRegistry,
  MarketSkillEntry,
  MarketInstallStatus,
  MarketUploadRequest
} from "../lib/types";
import { formatDate } from "../lib/utils";
import { ProviderPills } from "../components/shared/ProviderPills";
import { confirm } from "../state/confirm-store";

interface MarketPageProps {
  registry: MarketRegistry | null;
  isLoading: boolean;
  error: Error | null;
  onRefresh: () => void;
  localLibrary: GlobalSkillSummary[];
  onDownloadSuccess: () => Promise<void>;
}

const DEFAULT_REGISTRY_BASE = "https://raw.githubusercontent.com/htyashes-crypto/hty-skill-market/main/";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } }
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } }
};

const fadeLeft = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" as const } }
};

function getInstallStatus(entry: MarketSkillEntry, localLibrary: GlobalSkillSummary[]): MarketInstallStatus {
  const local = localLibrary.find((s) => s.skillId === entry.skillId);
  if (!local?.latestVersion) return "not_installed";
  if (local.latestVersion === entry.latestVersion) return "installed";
  return "update_available";
}

function isVersionInstalled(skillId: string, version: string, localLibrary: GlobalSkillSummary[]): boolean {
  const local = localLibrary.find((s) => s.skillId === skillId);
  if (!local) return false;
  return local.latestVersion === version;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MarketPage({ registry, isLoading, error, onRefresh, localLibrary, onDownloadSuccess }: MarketPageProps) {
  const { t } = useTranslation();
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const skills = registry?.skills ?? [];

  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills;
    const needle = search.toLowerCase();
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) ||
        skill.description.toLowerCase().includes(needle) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
        skill.author.toLowerCase().includes(needle)
    );
  }, [skills, search]);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.skillId === selectedSkillId) ?? null,
    [skills, selectedSkillId]
  );

  const downloadMutation = useMutation({
    mutationFn: (req: MarketDownloadRequest) => api.marketDownloadAndImport(req),
    onSuccess: () => onDownloadSuccess()
  });

  const handleDownload = async (skill: MarketSkillEntry, version: string, packageUrl: string) => {
    const req: MarketDownloadRequest = {
      registryBaseUrl: DEFAULT_REGISTRY_BASE,
      packageUrl,
      skillId: skill.skillId,
      version
    };
    try {
      await downloadMutation.mutateAsync(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NAME_CONFLICT")) {
        const confirmed = await confirm("\u540d\u79f0\u51b2\u7a81", `\u5168\u5c40\u5e93\u4e2d\u5df2\u6709\u540c\u540d\u6280\u80fd "${skill.name}"\uff0c\u662f\u5426\u66ff\u6362\uff1f`);
        if (confirmed) {
          downloadMutation.mutate({ ...req, forceReplace: true });
        }
      }
    }
  };

  if (isLoading) {
    return (
      <div className="page page--stack">
        <div className="empty-state">
          <Loader2 size={32} className="spin" />
          <p>{t("market.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page--stack">
        <div className="empty-state">
          <h3>{t("market.loadFailed")}</h3>
          <p>{String(error.message || error)}</p>
          <button type="button" className="button button--primary" onClick={onRefresh}>
            {t("market.retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div className="page three-column-layout library-layout" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* Left: Skill list */}
      <section className="panel panel--scroll-shell">
        <div className="panel__header">
          <div>
            <h3>{t("market.skillList")}</h3>
            <p>{t("market.skillListDesc")}</p>
          </div>
          <div className="panel__actions">
            <button type="button" className="button button--ghost button--sm" onClick={() => setUploadOpen(true)}>
              <Upload size={14} /> {t("market.upload")}
            </button>
            <button type="button" className="button button--ghost button--icon" onClick={onRefresh} title={t("market.refresh")}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="panel__search">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("market.search")}
            className="input"
          />
        </div>

        {filteredSkills.length === 0 ? (
          <div className="empty-state">
            <p>{skills.length === 0 ? t("market.empty") : t("market.noMatch")}</p>
          </div>
        ) : (
          <motion.div className="stack-list stack-list--scroll" variants={stagger} initial="hidden" animate="visible">
            {filteredSkills.map((skill) => (
                <motion.button
                  key={skill.skillId}
                  variants={fadeLeft}
                  type="button"
                  className={`skill-card ${selectedSkillId === skill.skillId ? "is-active" : ""}`}
                  onClick={() => setSelectedSkillId(skill.skillId)}
                >
                  <div className="skill-card__head">
                    <h4 className="skill-card__name">{skill.name}</h4>
                    <span className="skill-card__version">{skill.latestVersion}</span>
                  </div>
                  {skill.description && <p className="skill-card__desc">{skill.description}</p>}
                  <ProviderPills providers={skill.latestProviders} compact />
                </motion.button>
            ))}
          </motion.div>
        )}
        <div className="library-spacer" />
      </section>

      {/* Middle: Detail or Upload form */}
      <section className="panel panel--scroll-shell">
        {uploadOpen ? (
          <UploadPanel
            localLibrary={localLibrary}
            onClose={() => setUploadOpen(false)}
            onSuccess={() => {
              setUploadOpen(false);
              onRefresh();
              onDownloadSuccess();
            }}
          />
        ) : selectedSkill ? (
          <>
            <div className="panel__header panel__header--detail">
              <div className="detail-header-row">
                <span className="detail-badge">{selectedSkill.name.charAt(0).toUpperCase()}</span>
                <div>
                  <h3>{selectedSkill.name}</h3>
                  <p>{selectedSkill.description}</p>
                </div>
              </div>
            </div>

            <div className="detail-card">
              <div>
                <span className="detail-card__label">{t("market.author")}</span>
                <strong>{selectedSkill.author}</strong>
              </div>
              <div>
                <span className="detail-card__label">{t("common.tags")}</span>
                <strong>{selectedSkill.tags.join(" · ") || "—"}</strong>
              </div>
              <div>
                <span className="detail-card__label">{t("market.downloads")}</span>
                <strong>{selectedSkill.downloadCount}</strong>
              </div>
              <div>
                <span className="detail-card__label">{t("market.lastUpdated")}</span>
                <strong>{formatDate(selectedSkill.updatedAt)}</strong>
              </div>
            </div>

            {(() => {
              const status = getInstallStatus(selectedSkill, localLibrary);
              const localSkill = localLibrary.find((s) => s.skillId === selectedSkill.skillId);
              if (status !== "not_installed" && localSkill) {
                return (
                  <div className="detail-card detail-card--compact">
                    <div>
                      <span className="detail-card__label">{t("market.localVersion")}</span>
                      <strong>{localSkill.latestVersion}</strong>
                    </div>
                    <div>
                      <span className="detail-card__label">{t("market.cloudVersion")}</span>
                      <strong>{selectedSkill.latestVersion}</strong>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <motion.div className="versions-list" variants={stagger} initial="hidden" animate="visible">
              {selectedSkill.versions.map((version) => {
                const installed = isVersionInstalled(selectedSkill.skillId, version.version, localLibrary);
                const isDownloading =
                  downloadMutation.isPending &&
                  downloadMutation.variables?.skillId === selectedSkill.skillId &&
                  downloadMutation.variables?.version === version.version;

                return (
                  <motion.article key={version.version} className="version-card" variants={fadeUp}>
                    <header>
                      <div>
                        <h4>{version.version}</h4>
                        <span>{formatDate(version.publishedAt)}</span>
                      </div>
                      <ProviderPills providers={version.providers} compact />
                    </header>
                    <p>{version.notes || "—"}</p>
                    <footer className="version-card__footer">
                      <span className="version-card__size">{formatSize(version.packageSize)}</span>
                      <button
                        type="button"
                        className="button button--primary button--sm"
                        disabled={installed || isDownloading}
                        onClick={() => handleDownload(selectedSkill, version.version, version.packageUrl)}
                      >
                        {isDownloading ? (
                          <><Loader2 size={14} className="spin" /> {t("market.downloading")}</>
                        ) : installed ? (
                          <><Check size={14} /> {t("market.alreadyInstalled")}</>
                        ) : (
                          <><Download size={14} /> {t("market.download")}</>
                        )}
                      </button>
                    </footer>
                  </motion.article>
                );
              })}
            </motion.div>

            {downloadMutation.isError && (
              <div className="alert alert--error">{t("market.downloadFailed")}</div>
            )}
            {downloadMutation.isSuccess && (
              <div className="alert alert--success">
                {t("market.downloadSuccess", { name: selectedSkill.name, version: downloadMutation.variables?.version })}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <h3>{t("market.selectSkill")}</h3>
            <p>{t("market.selectSkillDesc")}</p>
          </div>
        )}
      </section>

      {/* Right: Version timeline */}
      <section className="panel panel--scroll-shell">
        <div className="panel__header">
          <div>
            <h3>{t("market.versionHistory")}</h3>
            <p>{t("market.titleDesc")}</p>
          </div>
        </div>
        <div className="timeline-list timeline-list--connected">
          {selectedSkill?.versions.map((version) => (
            <article key={version.version} className="timeline-item timeline-item--compact">
              <div className="timeline-item__marker" />
              <div>
                <strong>{version.version}</strong>
                <p>{version.notes || "—"}</p>
                <span>{formatDate(version.publishedAt)}</span>
              </div>
            </article>
          )) || <p className="muted">{t("market.selectSkillDesc")}</p>}
        </div>
      </section>
    </motion.div>
  );
}

/* ── Upload Panel ── */

interface UploadPanelProps {
  localLibrary: GlobalSkillSummary[];
  onClose: () => void;
  onSuccess: () => void;
}

function UploadPanel({ localLibrary, onClose, onSuccess }: UploadPanelProps) {
  const { t } = useTranslation();
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [author, setAuthor] = useState("");

  const skillDetailQuery = useQuery({
    queryKey: ["skill", selectedSkillId],
    enabled: Boolean(selectedSkillId),
    queryFn: () => api.getSkillDetail(selectedSkillId!)
  });

  const versions = skillDetailQuery.data?.versions ?? [];

  const uploadMutation = useMutation({
    mutationFn: (req: MarketUploadRequest) => api.marketUploadPackage(req),
    onSuccess
  });

  const handleUpload = () => {
    if (!selectedSkillId || !selectedVersion || !githubToken.trim()) return;
    uploadMutation.mutate({
      skillId: selectedSkillId,
      version: selectedVersion,
      githubToken: githubToken.trim(),
      owner: "htyashes-crypto",
      repo: "hty-skill-market",
      branch: "main",
      author: author.trim() || undefined
    });
  };

  return (
    <>
      <div className="panel__header panel__header--detail">
        <div>
          <h3>{t("market.uploadTitle")}</h3>
          <p>{t("market.uploadDesc")}</p>
        </div>
        <div className="panel__actions">
          <button type="button" className="button button--ghost button--sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>

      <div className="bind-panel">
        <label>
          <span className="dialog__label">{t("market.selectLocalSkill")}</span>
          <select
            value={selectedSkillId ?? ""}
            onChange={(e) => {
              setSelectedSkillId(e.target.value || null);
              setSelectedVersion("");
            }}
          >
            <option value="">-- {t("market.selectLocalSkill")} --</option>
            {localLibrary.map((skill) => (
              <option key={skill.skillId} value={skill.skillId}>
                {skill.name} ({skill.latestVersion})
              </option>
            ))}
          </select>
        </label>

        {versions.length > 0 && (
          <label>
            <span className="dialog__label">{t("common.version")}</span>
            <select value={selectedVersion} onChange={(e) => setSelectedVersion(e.target.value)}>
              <option value="">-- {t("common.version")} --</option>
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version} ({formatDate(v.publishedAt)})
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span className="dialog__label">{t("market.authorLabel")}</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder={t("market.authorPlaceholder")}
          />
        </label>

        <label>
          <span className="dialog__label">GitHub Token</span>
          <input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder={t("market.tokenPlaceholder")}
          />
          <p className="dialog__hint">{t("market.tokenHint")}</p>
        </label>

        {uploadMutation.isError && (
          <div className="alert alert--error">{t("market.uploadFailed")}: {String(uploadMutation.error?.message || uploadMutation.error)}</div>
        )}
        {uploadMutation.isSuccess && (
          <div className="alert alert--success">{t("market.uploadSuccess")}</div>
        )}

        <div className="panel__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={handleUpload}
            disabled={uploadMutation.isPending || !selectedSkillId || !selectedVersion || !githubToken.trim()}
          >
            {uploadMutation.isPending ? (
              <><Loader2 size={14} className="spin" /> {t("market.uploading")}</>
            ) : (
              <><Upload size={14} /> {t("market.confirmUpload")}</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
