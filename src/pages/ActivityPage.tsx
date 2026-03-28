import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import type { ActivityRecord } from "../lib/types";
import { formatDate } from "../lib/utils";

const ACTIVITY_KINDS = ["all", "publish", "install", "update", "delete", "import", "export", "settings", "edit", "rebuild", "market_upload"] as const;

const KIND_COLORS: Record<string, string> = {
  publish: "var(--brand-a)",
  install: "var(--brand-b)",
  update: "#a78bfa",
  delete: "var(--danger)",
  import: "#fbbf24",
  export: "#34d399",
  settings: "var(--text-muted)",
  edit: "#60a5fa",
  rebuild: "#f97316",
  market_upload: "#ec4899"
};

interface ActivityPageProps {
  activities: ActivityRecord[];
}

export function ActivityPage({ activities }: ActivityPageProps) {
  const { t } = useTranslation();
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    let result = activities;
    if (kindFilter !== "all") {
      result = result.filter((a) => a.kind === kindFilter);
    }
    if (searchQuery.trim()) {
      const needle = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(needle) ||
          a.detail.toLowerCase().includes(needle)
      );
    }
    return result;
  }, [activities, kindFilter, searchQuery]);

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="panel panel--full-height">
        <div className="panel__header">
          <div>
            <h3>{t("activity.title")}</h3>
            <p>{t("activity.description")}</p>
          </div>
        </div>

        <div className="activity-filters">
          <div className="activity-filters__tabs">
            {ACTIVITY_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`activity-filter-tab ${kindFilter === kind ? "is-active" : ""}`}
                onClick={() => setKindFilter(kind)}
              >
                {kind === "all"
                  ? t("activity.filterAll", { defaultValue: "\u5168\u90e8" })
                  : kind}
              </button>
            ))}
          </div>
          <div className="activity-filters__search">
            <Search size={14} />
            <input
              type="text"
              placeholder={t("activity.searchPlaceholder", { defaultValue: "\u641c\u7d22\u6d3b\u52a8..." })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="timeline-list timeline-list--dense">
          {filtered.length ? (
            filtered.map((activity) => (
              <article key={activity.id} className="timeline-item">
                <div className="timeline-item__marker" />
                <div>
                  <div className="activity-item__header">
                    <strong>{activity.title}</strong>
                    <span
                      className="activity-kind-badge"
                      style={{ color: KIND_COLORS[activity.kind] || "var(--text-muted)", borderColor: KIND_COLORS[activity.kind] || "var(--text-muted)" }}
                    >
                      {activity.kind}
                    </span>
                  </div>
                  <p>{activity.detail}</p>
                  <span>{formatDate(activity.createdAt)}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <p>{t("activity.noResults", { defaultValue: "\u6ca1\u6709\u5339\u914d\u7684\u6d3b\u52a8\u8bb0\u5f55" })}</p>
            </div>
          )}
        </div>
      </section>
    </motion.div>
  );
}
