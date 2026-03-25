import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Settings, ChevronUp, User } from "lucide-react";

interface Props {
  onOpenSettings: () => void;
}

export function UserProfileBar({ onOpenSettings }: Props) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="user-profile-bar" ref={menuRef}>
      {menuOpen && (
        <div className="user-profile-menu">
          <div className="user-profile-menu__email">{t("userProfile.local")}</div>
          <button
            className="user-profile-menu__item"
            onClick={() => { setMenuOpen(false); onOpenSettings(); }}
          >
            <Settings size={15} />
            {t("userProfile.settings")}
          </button>
        </div>
      )}
      <button
        className="user-profile-bar__trigger"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <div className="user-profile-bar__avatar">
          <User size={16} />
        </div>
        <div className="user-profile-bar__info">
          <span className="user-profile-bar__name">{t("userProfile.local")}</span>
        </div>
        <ChevronUp size={14} className={`user-profile-bar__chevron${menuOpen ? " is-open" : ""}`} />
      </button>
    </div>
  );
}
