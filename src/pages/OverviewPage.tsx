import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle, RefreshCw } from "lucide-react";
import type { DashboardSummary, GlobalSkillSummary, OutdatedInstance, WorkspaceRecord } from "../lib/types";
import { api } from "../lib/api";
import { formatDate } from "../lib/utils";
import { ProviderPills } from "../components/shared/ProviderPills";
import { toast } from "../state/toast-store";

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
  const outdated = dashboard?.outdatedInstances ?? [];

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
        <article className={`stat-card ${outdated.length > 0 ? "stat-card--accent-warn" : "stat-card--accent-d"}`}>
          <span>{t("overview.outdatedInstance", { defaultValue: "\u53ef\u66f4\u65b0\u5b9e\u4f8b" })}</span>
          <strong>{outdated.length}</strong>
          <p>{t("overview.outdatedInstanceDesc", { defaultValue: "\u672c\u5730\u5b9e\u4f8b\u843d\u540e\u4e8e\u5168\u5c40\u5e93\u7248\u672c" })}</p>
        </article>
      </motion.section>

      {outdated.length > 0 && (
        <motion.section variants={fadeUp}>
          <OutdatedPanel items={outdated} />
        </motion.section>
      )}

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

function OutdatedPanel({ items }: { items: OutdatedInstance[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const batchMutation = useMutation({
    mutationFn: (batchItems: OutdatedInstance[]) =>
      api.batchUpdateInstances(
        batchItems.map((item) => ({
          workspaceRoot: item.workspaceRoot,
          instanceId: item.instanceId
        }))
      ),
    onSuccess: async (result) => {
      const parts: string[] = [];
      if (result.updated > 0) parts.push(`${result.updated} \u4e2a\u5df2\u66f4\u65b0`);
      if (result.skipped > 0) parts.push(`${result.skipped} \u4e2a\u5df2\u8df3\u8fc7`);
      if (result.conflicted > 0) parts.push(`${result.conflicted} \u4e2a\u6709\u51b2\u7a81`);
      if (result.failed > 0) parts.push(`${result.failed} \u4e2a\u5931\u8d25`);
      toast(result.failed > 0 || result.conflicted > 0 ? "info" : "success", parts.join("\uff0c"));
      setUpdatingIds(new Set());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] })
      ]);
    },
    onError: (err) => {
      toast("error", `\u6279\u91cf\u66f4\u65b0\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
      setUpdatingIds(new Set());
    }
  });

  const handleUpdateAll = () => {
    setUpdatingIds(new Set(items.map((i) => i.instanceId)));
    batchMutation.mutate(items);
  };

  const handleUpdateOne = (item: OutdatedInstance) => {
    setUpdatingIds(new Set([item.instanceId]));
    batchMutation.mutate([item]);
  };

  return (
    <div className="panel outdated-panel">
      <div className="outdated-panel__header">
        <div className="outdated-panel__title-group">
          <h3 className="outdated-panel__title">
            <ArrowUpCircle size={16} />
            {t("overview.outdatedTitle", { defaultValue: "\u53ef\u66f4\u65b0\u5b9e\u4f8b" })}
            <span className="outdated-panel__count">{items.length}</span>
          </h3>
          <p className="outdated-panel__subtitle">{t("overview.outdatedDesc", { defaultValue: "\u4ee5\u4e0b\u672c\u5730\u5b9e\u4f8b\u7684\u7248\u672c\u843d\u540e\u4e8e\u5168\u5c40\u5e93" })}</p>
        </div>
        <button
          className="button button--primary outdated-panel__update-all"
          disabled={batchMutation.isPending}
          onClick={handleUpdateAll}
        >
          {batchMutation.isPending ? (
            <><RefreshCw size={14} className="spin" /> {t("common.processing")}</>
          ) : (
            t("overview.updateAll", { defaultValue: "\u5168\u90e8\u66f4\u65b0" })
          )}
        </button>
      </div>
      <div className="outdated-panel__list">
        {items.map((item) => (
          <div key={`${item.workspaceId}-${item.instanceId}`} className="outdated-panel__row">
            <div className="outdated-panel__info">
              <strong>{item.instanceName}</strong>
              <span className="outdated-panel__meta">
                {item.skillName} &middot; {item.workspaceName} &middot;
                <span className={`outdated-panel__provider outdated-panel__provider--${item.provider}`}>{item.provider}</span>
              </span>
            </div>
            <div className="outdated-panel__version">
              <span className="outdated-panel__old">{item.currentVersion}</span>
              <span className="outdated-panel__arrow">&rarr;</span>
              <span className="outdated-panel__new">{item.latestVersion}</span>
            </div>
            <button
              className="button button--ghost outdated-panel__row-btn"
              disabled={updatingIds.has(item.instanceId)}
              onClick={() => handleUpdateOne(item)}
            >
              {updatingIds.has(item.instanceId) ? <RefreshCw size={12} className="spin" /> : t("common.refresh", { defaultValue: "\u66f4\u65b0" })}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
