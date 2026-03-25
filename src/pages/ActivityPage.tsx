import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { ActivityRecord } from "../lib/types";
import { formatDate } from "../lib/utils";

interface ActivityPageProps {
  activities: ActivityRecord[];
}

export function ActivityPage({ activities }: ActivityPageProps) {
  const { t } = useTranslation();
  return (
    <motion.div className="page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="panel panel--full-height">
        <div className="panel__header">
          <div>
            <h3>{t("activity.title")}</h3>
            <p>{t("activity.description")}</p>
          </div>
        </div>
        <div className="timeline-list timeline-list--dense">
          {activities.map((activity) => (
            <article key={activity.id} className="timeline-item">
              <div className="timeline-item__marker" />
              <div>
                <strong>{activity.title}</strong>
                <p>{activity.detail}</p>
                <span>{activity.kind} · {formatDate(activity.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </motion.div>
  );
}
