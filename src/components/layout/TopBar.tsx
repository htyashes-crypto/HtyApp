import { FolderPlus, Import, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TopBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onAddWorkspace: () => void;
  onImportPackage: () => void;
}

export function TopBar({
  search,
  onSearchChange,
  onAddWorkspace,
  onImportPackage
}: TopBarProps) {
  const { t } = useTranslation();
  return (
    <div className="topbar">
      <label className="topbar__search">
        <Search size={16} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("topbar.search")}
        />
      </label>

      <div className="topbar__actions">
        <button type="button" className="button button--ghost" onClick={onAddWorkspace}>
          <FolderPlus size={16} />
          <span>{t("topbar.addWorkspace")}</span>
        </button>
        <button type="button" className="button button--ghost" onClick={onImportPackage}>
          <Import size={16} />
          <span>{t("topbar.importPackage")}</span>
        </button>
      </div>
    </div>
  );
}
