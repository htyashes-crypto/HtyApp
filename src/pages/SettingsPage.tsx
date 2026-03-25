import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import type { DashboardSummary } from "../lib/types";
import { api } from "../lib/api";
import { pickLibraryRoot } from "../lib/dialogs";
import { useThemeStore } from "../state/theme-store";
import type { AppLanguage } from "../state/theme-store";
import { useUiStore } from "../state/ui-store";

interface SettingsPageProps {
  dashboard: DashboardSummary | undefined;
}

export function SettingsPage({ dashboard }: SettingsPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["app-settings"], queryFn: api.getAppSettings });
  const [draftRoot, setDraftRoot] = useState("");
  const [moveExisting, setMoveExisting] = useState(true);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const language = useThemeStore((state) => state.language);
  const setLanguage = useThemeStore((state) => state.setLanguage);
  const autoApprove = useUiStore((state) => state.autoApprove);
  const setAutoApprove = useUiStore((state) => state.setAutoApprove);

  useEffect(() => {
    if (settingsQuery.data?.libraryRoot) {
      setDraftRoot(settingsQuery.data.libraryRoot);
    }
  }, [settingsQuery.data?.libraryRoot]);

  const updateMutation = useMutation({
    mutationFn: (libraryRoot: string | null) =>
      api.updateLibraryRoot({
        libraryRoot,
        moveExisting
      }),
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

  const currentSettings = settingsQuery.data;
  const currentLibraryRoot = currentSettings?.libraryRoot || dashboard?.libraryRoot || "-";
  const currentStoreRoot = currentSettings?.storeRoot || dashboard?.storeRoot || "-";
  const defaultLibraryRoot = currentSettings?.defaultLibraryRoot || dashboard?.libraryRoot || "-";

  const handleChooseLibraryRoot = async () => {
    const selected = await pickLibraryRoot();
    if (!selected) {
      return;
    }
    setDraftRoot(selected);
  };

  const handleSave = async () => {
    const trimmed = draftRoot.trim();
    await updateMutation.mutateAsync(trimmed || null);
  };

  const handleReset = async () => {
    await updateMutation.mutateAsync(null);
  };

  return (
    <motion.div className="page page--stack settings-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* ── 语言 ── */}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h3>{t("settings.language")}</h3>
            <p>{t("settings.languageDesc")}</p>
          </div>
        </div>
        <div className="bind-panel settings-theme-panel">
          <div className="segmented-control settings-theme-switch">
            <button type="button" className={language === "zh-CN" ? "is-active" : ""} onClick={() => setLanguage("zh-CN")}>{t("settings.langZh")}</button>
            <button type="button" className={language === "en" ? "is-active" : ""} onClick={() => setLanguage("en" as AppLanguage)}>{t("settings.langEn")}</button>
          </div>
        </div>
      </section>

      {/* ── 主题 ── */}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h3>{t("settings.theme")}</h3>
            <p>{t("settings.themeDesc")}</p>
          </div>
        </div>
        <div className="bind-panel settings-theme-panel">
          <div className="bind-panel__header">
            <h4>{t("settings.themeSwitch")}</h4>
            <p>{t("settings.themeSwitchDesc")}</p>
          </div>
          <div className="segmented-control settings-theme-switch">
            <button type="button" className={theme === "dark" ? "is-active" : ""} onClick={() => setTheme("dark")}>{t("settings.dark")}</button>
            <button type="button" className={theme === "light" ? "is-active" : ""} onClick={() => setTheme("light")}>{t("settings.light")}</button>
          </div>
        </div>
      </section>

      {/* ── 合并审核 ── */}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h3>{t("settings.mergeReview")}</h3>
            <p>{t("settings.mergeReviewDesc")}</p>
          </div>
        </div>
        <div className="bind-panel settings-theme-panel">
          <div className="bind-panel__header">
            <h4>{t("settings.autoReview")}</h4>
            <p>{t("settings.autoReviewDesc")}</p>
          </div>
          <div className="segmented-control settings-toggle-control">
            <button type="button" className={autoApprove ? "is-active" : ""} onClick={() => setAutoApprove(true)}>{t("settings.autoApprove")}</button>
            <button type="button" className={!autoApprove ? "is-active" : ""} onClick={() => setAutoApprove(false)}>{t("settings.manualReview")}</button>
          </div>
        </div>
      </section>

      {/* ── 全局库路径 ── */}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h3>{t("settings.libraryPath")}</h3>
            <p>{t("settings.libraryPathDesc")}</p>
          </div>
        </div>
        <div className="detail-card detail-card--vertical">
          <div><span className="detail-card__label">{t("settings.currentLibraryRoot")}</span><strong>{currentLibraryRoot}</strong></div>
          <div><span className="detail-card__label">{t("settings.currentStoreRoot")}</span><strong>{currentStoreRoot}</strong></div>
          <div><span className="detail-card__label">{t("settings.defaultLibraryRoot")}</span><strong>{defaultLibraryRoot}</strong></div>
        </div>
        <div className="bind-panel settings-path-form">
          <div className="bind-panel__header">
            <h4>{t("settings.customPath")}</h4>
            <p>{t("settings.customPathDesc")}</p>
          </div>
          <label>
            <span className="dialog__label">{t("settings.targetPath")}</span>
            <input value={draftRoot} onChange={(event) => setDraftRoot(event.target.value)} placeholder={t("settings.targetPathPlaceholder")} />
          </label>
          <div className="settings-toggle-row">
            <div>
              <span className="dialog__label">{t("settings.migrateData")}</span>
              <p className="dialog__hint">{t("settings.migrateDataDesc")}</p>
            </div>
            <div className="segmented-control settings-toggle-control">
              <button type="button" className={moveExisting ? "is-active" : ""} onClick={() => setMoveExisting(true)}>{t("settings.migrate")}</button>
              <button type="button" className={!moveExisting ? "is-active" : ""} onClick={() => setMoveExisting(false)}>{t("settings.switchOnly")}</button>
            </div>
          </div>
          {updateMutation.error ? <div className="alert alert--error">{String(updateMutation.error)}</div> : null}
          <div className="panel__actions settings-actions">
            <button type="button" className="button button--ghost" onClick={handleChooseLibraryRoot}>{t("settings.chooseDirectory")}</button>
            <button type="button" className="button button--primary" onClick={handleSave} disabled={updateMutation.isPending || !draftRoot.trim()}>{t("settings.savePath")}</button>
            <button type="button" className="button button--ghost" onClick={handleReset} disabled={updateMutation.isPending || !currentSettings?.usingCustomLibraryRoot}>{t("settings.resetDefault")}</button>
          </div>
        </div>
      </section>

      {/* ── 数据恢复 ── */}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h3>{t("settings.dataRecovery")}</h3>
            <p>{t("settings.dataRecoveryDesc")}</p>
          </div>
        </div>
        <div className="bind-panel">
          <div className="bind-panel__header">
            <h4>{t("settings.rebuildFromStore")}</h4>
            <p>{t("settings.rebuildFromStoreDesc")}</p>
          </div>
          {rebuildMutation.error ? <div className="alert alert--error">{String(rebuildMutation.error)}</div> : null}
          {rebuildMutation.isSuccess ? (
            <div className="alert alert--success">
              {rebuildMutation.data > 0 ? t("settings.recovered", { count: rebuildMutation.data }) : t("settings.noSkillToRecover")}
            </div>
          ) : null}
          <div className="panel__actions">
            <button type="button" className="button button--primary" onClick={() => rebuildMutation.mutate()} disabled={rebuildMutation.isPending}>
              {rebuildMutation.isPending ? t("settings.recovering") : t("settings.rebuildButton")}
            </button>
          </div>
        </div>
      </section>

      {/* ── 当前规则 ── */}
      <section className="panel">
        <div className="panel__header">
          <div>
            <h3>{t("settings.currentRules")}</h3>
            <p>{t("settings.currentRulesDesc")}</p>
          </div>
        </div>
        <ul className="bullet-list">
          <li>{t("settings.rule1")}</li>
          <li>{t("settings.rule2")}</li>
          <li>{t("settings.rule3")}</li>
          <li>{t("settings.rule4")}</li>
        </ul>
      </section>
    </motion.div>
  );
}
