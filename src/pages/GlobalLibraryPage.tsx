import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { GlobalSkillDetail, GlobalSkillSummary } from "../lib/types";
import { formatDate } from "../lib/utils";
import { ProviderPills } from "../components/shared/ProviderPills";

interface GlobalLibraryPageProps {
  skills: GlobalSkillSummary[];
  selectedSkillId: string | null;
  onSelectSkill: (skillId: string) => void;
  detail: GlobalSkillDetail | null;
  onExport: () => void;
}

export function GlobalLibraryPage({ skills, selectedSkillId, onSelectSkill, detail, onExport }: GlobalLibraryPageProps) {
  const { t } = useTranslation();
  return (
    <motion.div className="page three-column-layout library-layout" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="panel panel--scroll-shell">
        <div className="panel__header">
          <div>
            <h3>{t("library.skillList")}</h3>
            <p>{t("library.skillListDesc")}</p>
          </div>
        </div>
        <div className="stack-list stack-list--scroll">
          {skills.map((skill) => (
            <button
              key={skill.skillId}
              type="button"
              className={`list-card list-card--interactive ${selectedSkillId === skill.skillId ? "is-active" : ""}`}
              onClick={() => onSelectSkill(skill.skillId)}
            >
              <div>
                <h4>{skill.name}</h4>
                <p>{skill.description}</p>
              </div>
              <div className="list-card__meta">
                <span>{skill.latestVersion || t("library.unpublished")}</span>
                <ProviderPills providers={skill.latestProviders} compact />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        {detail ? (
          <>
            <div className="panel__header">
              <div>
                <h3>{detail.skill.name}</h3>
                <p>{detail.skill.description}</p>
              </div>
              <div className="panel__actions">
                <button type="button" className="button button--ghost" onClick={onExport}>
                  {t("library.exportPackage")}
                </button>
              </div>
            </div>

            <div className="detail-card">
              <div>
                <span className="detail-card__label">{t("library.latestVersion")}</span>
                <strong>{detail.skill.latestVersion || t("library.unpublished")}</strong>
              </div>
              <div>
                <span className="detail-card__label">{t("common.tags")}</span>
                <strong>{detail.skill.tags.join(" · ") || t("library.noTags")}</strong>
              </div>
            </div>

            <div className="versions-list">
              {detail.versions.map((version) => (
                <article key={version.version} className="version-card">
                  <header>
                    <div>
                      <h4>{version.version}</h4>
                      <span>{formatDate(version.publishedAt)}</span>
                    </div>
                    <ProviderPills providers={version.providers.map((item) => item.provider)} compact />
                  </header>
                  <p>{version.notes || t("library.noVersionNotes")}</p>
                  <div className="version-card__providers">
                    {version.providers.map((provider) => (
                      <div key={provider.provider} className="version-card__provider-row">
                        <strong>{provider.provider}</strong>
                        <span>{provider.displayName}</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h3>{t("library.selectSkill")}</h3>
            <p>{t("library.selectSkillDesc")}</p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h3>{t("library.versionTimeline")}</h3>
            <p>{t("library.versionTimelineDesc")}</p>
          </div>
        </div>
        <div className="timeline-list">
          {detail?.versions.map((version) => (
            <article key={version.version} className="timeline-item timeline-item--compact">
              <div className="timeline-item__marker" />
              <div>
                <strong>{version.version}</strong>
                <p>{version.notes || t("library.noNotes")}</p>
                <span>{formatDate(version.publishedAt)}</span>
              </div>
            </article>
          )) || <p className="muted">{t("library.noVersionInfo")}</p>}
        </div>
      </section>
    </motion.div>
  );
}
