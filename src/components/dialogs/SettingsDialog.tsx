import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "../../lib/api";
import { pickLibraryRoot } from "../../lib/dialogs";
import { useThemeStore } from "../../state/theme-store";
import type { AppLanguage } from "../../state/theme-store";
import { useUiStore } from "../../state/ui-store";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["app-settings"], queryFn: api.getAppSettings, enabled: open });
  const dashboardQuery = useQuery({ queryKey: ["dashboard"], queryFn: api.getDashboard, enabled: open });
  const [draftRoot, setDraftRoot] = useState("");
  const [moveExisting, setMoveExisting] = useState(true);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const language = useThemeStore((s) => s.language);
  const setLanguage = useThemeStore((s) => s.setLanguage);
  const autoApprove = useUiStore((s) => s.autoApprove);
  const setAutoApprove = useUiStore((s) => s.setAutoApprove);

  useEffect(() => {
    if (settingsQuery.data?.libraryRoot) {
      setDraftRoot(settingsQuery.data.libraryRoot);
    }
  }, [settingsQuery.data?.libraryRoot]);

  const updateMutation = useMutation({
    mutationFn: (libraryRoot: string | null) =>
      api.updateLibraryRoot({ libraryRoot, moveExisting }),
    onSuccess: async (settings) => {
      setDraftRoot(settings.libraryRoot);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["library"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace"] }),
        queryClient.invalidateQueries({ queryKey: ["skill"] })
      ]);
    }
  });

  const rebuildMutation = useMutation({
    mutationFn: () => api.rebuildLibraryFromStore(),
    onSuccess: async (count) => {
      if (count > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["library"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
          queryClient.invalidateQueries({ queryKey: ["activity"] }),
          queryClient.invalidateQueries({ queryKey: ["skill"] })
        ]);
      }
    }
  });

  if (!open) return null;

  const currentSettings = settingsQuery.data;
  const dashboard = dashboardQuery.data;
  const currentLibraryRoot = currentSettings?.libraryRoot || dashboard?.libraryRoot || "-";
  const currentStoreRoot = currentSettings?.storeRoot || dashboard?.storeRoot || "-";
  const defaultLibraryRoot = currentSettings?.defaultLibraryRoot || dashboard?.libraryRoot || "-";

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog settings-dialog">
        <div className="dialog__header">
          <h2>{t("common.settings")}</h2>
          <button type="button" className="button button--ghost" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="settings-dialog__body">
          {/* Language */}
          <section className="settings-dialog__section">
            <h3>{t("settings.language")}</h3>
            <p className="settings-dialog__desc">{t("settings.languageDesc")}</p>
            <div className="segmented-control settings-theme-switch">
              <button type="button" className={language === "zh-CN" ? "is-active" : ""} onClick={() => setLanguage("zh-CN")}>{t("settings.langZh")}</button>
              <button type="button" className={language === "en" ? "is-active" : ""} onClick={() => setLanguage("en" as AppLanguage)}>{t("settings.langEn")}</button>
            </div>
          </section>

          {/* Theme */}
          <section className="settings-dialog__section">
            <h3>{t("settings.theme")}</h3>
            <p className="settings-dialog__desc">{t("settings.themeDesc")}</p>
            <div className="segmented-control settings-theme-switch">
              <button type="button" className={theme === "dark" ? "is-active" : ""} onClick={() => setTheme("dark")}>{t("settings.dark")}</button>
              <button type="button" className={theme === "light" ? "is-active" : ""} onClick={() => setTheme("light")}>{t("settings.light")}</button>
            </div>
          </section>

          {/* Merge review */}
          <section className="settings-dialog__section">
            <h3>{t("settings.mergeReview")}</h3>
            <p className="settings-dialog__desc">{t("settings.mergeReviewDesc")}</p>
            <div className="segmented-control settings-toggle-control">
              <button type="button" className={autoApprove ? "is-active" : ""} onClick={() => setAutoApprove(true)}>{t("settings.autoApprove")}</button>
              <button type="button" className={!autoApprove ? "is-active" : ""} onClick={() => setAutoApprove(false)}>{t("settings.manualReview")}</button>
            </div>
          </section>

          {/* Library path */}
          <section className="settings-dialog__section">
            <h3>{t("settings.libraryPath")}</h3>
            <div className="settings-dialog__paths">
              <div><span className="settings-dialog__path-label">Library Root</span><span>{currentLibraryRoot}</span></div>
              <div><span className="settings-dialog__path-label">Store Root</span><span>{currentStoreRoot}</span></div>
              <div><span className="settings-dialog__path-label">Default</span><span>{defaultLibraryRoot}</span></div>
            </div>

            <label>
              <span className="dialog__label">{t("settings.customPath")}</span>
              <input value={draftRoot} onChange={(e) => setDraftRoot(e.target.value)} placeholder={t("settings.targetPathPlaceholder")} />
            </label>

            <div className="settings-dialog__row">
              <div>
                <span className="dialog__label">{t("settings.migrateData")}</span>
                <p className="dialog__hint">{t("settings.migrateDataDesc")}</p>
              </div>
              <div className="segmented-control settings-toggle-control">
                <button type="button" className={moveExisting ? "is-active" : ""} onClick={() => setMoveExisting(true)}>{t("settings.migrate")}</button>
                <button type="button" className={!moveExisting ? "is-active" : ""} onClick={() => setMoveExisting(false)}>{t("settings.switchOnly")}</button>
              </div>
            </div>

            {updateMutation.error && <div className="alert alert--error">{String(updateMutation.error)}</div>}

            <div className="settings-dialog__actions">
              <button type="button" className="button button--ghost" onClick={async () => { const s = await pickLibraryRoot(); if (s) setDraftRoot(s); }}>{t("settings.chooseDirectory")}</button>
              <button type="button" className="button button--primary" onClick={() => updateMutation.mutateAsync(draftRoot.trim() || null)} disabled={updateMutation.isPending || !draftRoot.trim()}>{t("settings.savePath")}</button>
              <button type="button" className="button button--ghost" onClick={() => updateMutation.mutateAsync(null)} disabled={updateMutation.isPending || !currentSettings?.usingCustomLibraryRoot}>{t("settings.resetDefault")}</button>
            </div>
          </section>

          {/* Rebuild */}
          <section className="settings-dialog__section">
            <h3>{t("settings.dataRecovery")}</h3>
            <p className="settings-dialog__desc">{t("settings.dataRecoveryDesc")}</p>
            {rebuildMutation.error && <div className="alert alert--error">{String(rebuildMutation.error)}</div>}
            {rebuildMutation.isSuccess && (
              <div className="alert alert--success">
                {rebuildMutation.data > 0 ? t("settings.recovered", { count: rebuildMutation.data }) : t("settings.noSkillToRecover")}
              </div>
            )}
            <button type="button" className="button button--primary" onClick={() => rebuildMutation.mutate()} disabled={rebuildMutation.isPending}>
              {rebuildMutation.isPending ? t("settings.recovering") : t("settings.rebuildButton")}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
