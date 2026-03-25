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

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

const fadeLeft = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

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
        <motion.div className="stack-list stack-list--scroll" variants={stagger} initial="hidden" animate="visible">
          {skills.map((skill) => (
            <motion.button
              key={skill.skillId}
              variants={fadeLeft}
              type="button"
              className={`skill-card ${selectedSkillId === skill.skillId ? "is-active" : ""}`}
              onClick={() => onSelectSkill(skill.skillId)}
            >
              <div className="skill-card__head">
                <h4 className="skill-card__name">{skill.name}</h4>
                {skill.latestVersion && <span className="skill-card__version">{skill.latestVersion}</span>}
              </div>
              {skill.description && <p className="skill-card__desc">{skill.description}</p>}
              <ProviderPills providers={skill.latestProviders} compact />
            </motion.button>
          ))}
        </motion.div>
        <div className="library-spacer" />
      </section>

      <section className="panel panel--scroll-shell">
        {detail ? (
          <>
            <div className="panel__header panel__header--detail">
              <div className="detail-header-row">
                <span className="detail-badge">{detail.skill.name.charAt(0).toUpperCase()}</span>
                <div>
                  <h3>{detail.skill.name}</h3>
                  <p>{detail.skill.description}</p>
                </div>
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

            <motion.div className="versions-list" variants={stagger} initial="hidden" animate="visible">
              {detail.versions.map((version) => (
                <motion.article key={version.version} className="version-card" variants={fadeUp}>
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
                </motion.article>
              ))}
            </motion.div>
          </>
        ) : (
          <div className="empty-state">
            <h3>{t("library.selectSkill")}</h3>
            <p>{t("library.selectSkillDesc")}</p>
          </div>
        )}
      </section>

      <section className="panel panel--scroll-shell">
        <div className="panel__header">
          <div>
            <h3>{t("library.versionTimeline")}</h3>
            <p>{t("library.versionTimelineDesc")}</p>
          </div>
        </div>
        <div className="timeline-list timeline-list--connected">
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
