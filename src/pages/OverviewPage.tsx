import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { DashboardSummary, GlobalSkillSummary, WorkspaceRecord } from "../lib/types";
import { formatDate } from "../lib/utils";
import { ProviderPills } from "../components/shared/ProviderPills";

interface OverviewPageProps {
  dashboard: DashboardSummary | undefined;
  library: GlobalSkillSummary[];
  workspaces: WorkspaceRecord[];
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export function OverviewPage({ dashboard, library, workspaces }: OverviewPageProps) {
  const { t } = useTranslation();
  const featured = library.slice(0, 3);

  return (
    <motion.div className="page page--stack" variants={stagger} initial="hidden" animate="visible">
      <motion.section className="hero-card" variants={fadeUp}>
        <div>
          <span className="eyebrow">{t("overview.heroEyebrow")}</span>
          <h2>{t("overview.heroTitle")}</h2>
          <p>{t("overview.heroDescription")}</p>
        </div>
        <div className="hero-card__note">
          <span>{t("overview.defaultRule")}</span>
          <strong>{t("overview.defaultUpload")}</strong>
          <strong>{t("overview.defaultUpdate")}</strong>
        </div>
      </motion.section>

      <motion.section className="stats-grid" variants={fadeUp}>
        <article className="stat-card stat-card--accent-a">
          <span>{t("overview.logicSkill")}</span>
          <strong>{dashboard?.globalSkillCount ?? 0}</strong>
          <p>{t("overview.logicSkillDesc")}</p>
        </article>
        <article className="stat-card stat-card--accent-b">
          <span>{t("overview.globalVersion")}</span>
          <strong>{dashboard?.versionCount ?? 0}</strong>
          <p>{t("overview.globalVersionDesc")}</p>
        </article>
        <article className="stat-card stat-card--accent-c">
          <span>{t("overview.workspace")}</span>
          <strong>{dashboard?.workspaceCount ?? 0}</strong>
          <p>{t("overview.workspaceDesc")}</p>
        </article>
        <article className="stat-card stat-card--accent-d">
          <span>{t("overview.unboundInstance")}</span>
          <strong>{dashboard?.unboundInstanceCount ?? 0}</strong>
          <p>{t("overview.unboundInstanceDesc")}</p>
        </article>
      </motion.section>

      <motion.section className="content-grid content-grid--overview" variants={fadeUp}>
        <div className="panel">
          <div className="panel__header">
            <div>
              <h3>{t("overview.featuredTitle")}</h3>
              <p>{t("overview.featuredDesc")}</p>
            </div>
          </div>
          <div className="stack-list">
            {featured.map((skill) => (
              <article key={skill.skillId} className="list-card list-card--hoverable">
                <div>
                  <h4>{skill.name}</h4>
                  <p>{skill.description}</p>
                </div>
                <div className="list-card__meta">
                  <span>{skill.latestVersion || t("common.unpublished")}</span>
                  <ProviderPills providers={skill.latestProviders} compact />
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <h3>{t("overview.activityTitle")}</h3>
              <p>{t("overview.activityDesc")}</p>
            </div>
          </div>
          <div className="timeline-list timeline-list--connected">
            {dashboard?.recentActivities.map((activity) => (
              <article key={activity.id} className="timeline-item">
                <div className="timeline-item__marker" />
                <div>
                  <strong>{activity.title}</strong>
                  <p>{activity.detail}</p>
                  <span>{formatDate(activity.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <h3>{t("overview.workspacesTitle")}</h3>
              <p>{t("overview.workspacesDesc")}</p>
            </div>
          </div>
          <div className="stack-list">
            {workspaces.map((workspace) => (
              <article key={workspace.workspaceId} className="workspace-card workspace-card--hoverable">
                <strong>{workspace.kind === "special" ? `${workspace.name} · ${t("overview.special")}` : workspace.name}</strong>
                <span>
                  {workspace.kind === "special"
                    ? workspace.availableProviders.length
                      ? workspace.availableProviders.join(" / ")
                      : t("overview.noProvider")
                    : workspace.rootPath}
                </span>
              </article>
            ))}
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}
