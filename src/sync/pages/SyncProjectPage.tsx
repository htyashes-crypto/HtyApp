import { Clock, FileSearch, ShieldBan, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSyncUiStore } from "../state/sync-ui-store";
import { SyncTimelinePanel } from "../panels/SyncTimelinePanel";
import { PendingChangesPanel } from "../panels/PendingChangesPanel";
import { BlacklistPanel } from "../panels/BlacklistPanel";
import { SyncLogsPanel } from "../panels/SyncLogsPanel";
import type { SyncProject, SyncPanel } from "../lib/sync-types";

interface Props {
  project: SyncProject;
  repoPath: string;
}

const NAV_ITEMS: { key: SyncPanel; labelKey: string; icon: typeof Clock }[] = [
  { key: "timeline", labelKey: "sync.syncTimeline", icon: Clock },
  { key: "pending", labelKey: "sync.pendingChanges", icon: FileSearch },
  { key: "blacklist", labelKey: "sync.blacklist", icon: ShieldBan },
  { key: "logs", labelKey: "sync.syncLogs", icon: ScrollText }
];

export function SyncProjectPage({ project, repoPath }: Props) {
  const { t } = useTranslation();
  const syncPanel = useSyncUiStore((s) => s.syncPanel);
  const setSyncPanel = useSyncUiStore((s) => s.setSyncPanel);

  const panelContent = (() => {
    switch (syncPanel) {
      case "timeline":
        return <SyncTimelinePanel project={project} repoPath={repoPath} />;
      case "pending":
        return <PendingChangesPanel project={project} repoPath={repoPath} />;
      case "blacklist":
        return <BlacklistPanel project={project} />;
      case "logs":
        return <SyncLogsPanel project={project} />;
    }
  })();

  return (
    <div className="sync-project-page">
      <div className="sync-project-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={`sync-nav-item${syncPanel === item.key ? " is-active" : ""}`}
              onClick={() => setSyncPanel(item.key)}
            >
              <Icon size={15} />
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>
      <div className="sync-project-content">
        {panelContent}
      </div>
    </div>
  );
}
