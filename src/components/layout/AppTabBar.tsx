import { Bookmark, Boxes, FolderSync, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../state/ui-store";
import type { AppTab } from "../../state/ui-store";

export function AppTabBar() {
  const { t } = useTranslation();
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  const tabs: { key: AppTab; label: string; icon: typeof Boxes }[] = [
    { key: "skill", label: t("appTab.skill"), icon: Boxes },
    { key: "sync", label: t("appTab.sync"), icon: FolderSync },
    { key: "tasks", label: t("appTab.tasks"), icon: ListChecks },
    { key: "marks", label: t("appTab.marks"), icon: Bookmark }
  ];

  return (
    <div className="app-tab-bar">
      <div className="app-tab-bar__track">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              className={`app-tab-bar__tab${isActive ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
