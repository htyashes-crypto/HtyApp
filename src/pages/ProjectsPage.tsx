import { type KeyboardEvent, type MouseEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import type {
  GlobalSkillDetail,
  GlobalSkillSummary,
  LocalInstance,
  Provider,
  WorkspaceRecord,
  WorkspaceSnapshot
} from "../lib/types";
import { ProviderPills } from "../components/shared/ProviderPills";

type ProviderFilter = "all" | Provider;

interface ProjectsPageProps {
  search: string;
  workspaces: WorkspaceRecord[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  snapshot: WorkspaceSnapshot | null;
  selectedInstance: LocalInstance | null;
  onSelectInstance: (instance: LocalInstance) => void;
  onOpenPublish: () => void;
  onOpenInstall: () => void;
  onScanWorkspace: () => void;
  onRefreshWorkspace: () => void;
  library: GlobalSkillSummary[];
  selectedSkillId: string | null;
  onSelectSkillId: (skillId: string) => void;
  selectedSkillDetail: GlobalSkillDetail | null;
  onBind: (skillId: string) => Promise<void>;
  onUpdateBoundInstance: (instanceId: string) => Promise<string | void>;
  onRollbackInstance: (instanceId: string, targetVersion: string) => Promise<string | void>;
}

export function ProjectsPage({
  search,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  snapshot,
  selectedInstance,
  onSelectInstance,
  onOpenPublish,
  onOpenInstall,
  onScanWorkspace,
  onRefreshWorkspace,
  library,
  selectedSkillId,
  onSelectSkillId,
  selectedSkillDetail,
  onBind,
  onUpdateBoundInstance,
  onRollbackInstance
}: ProjectsPageProps) {
  const { t } = useTranslation();
  const [binding, setBinding] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState<string>("");
  const [rollingBack, setRollingBack] = useState(false);
  const [updatingInstanceId, setUpdatingInstanceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");

  const summary = useMemo(() => {
    const instances = snapshot?.instances ?? [];
    const boundCount = instances.filter((item) => item.status === "bound").length;
    return {
      totalCount: instances.length,
      boundCount,
      unboundCount: instances.length - boundCount
    };
  }, [snapshot]);

  const filteredInstances = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (snapshot?.instances ?? []).filter((instance) => {
      const matchesProvider = providerFilter === "all" || instance.provider === providerFilter;
      if (!matchesProvider) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        instance.displayName.toLowerCase().includes(needle) ||
        instance.relativePath.toLowerCase().includes(needle) ||
        instance.provider.toLowerCase().includes(needle) ||
        (instance.linkedVersion || "").toLowerCase().includes(needle)
      );
    });
  }, [providerFilter, search, snapshot]);

  const workspacePathLabel = snapshot?.workspace.kind === "special"
    ? t("projects.specialDir")
    : snapshot?.workspace.rootPath || t("projects.noWorkspaceSelected");
  const workspaceIndexLabel = snapshot?.workspace.kind === "special"
    ? snapshot.workspace.availableProviders.length
      ? snapshot.workspace.availableProviders.join(" / ")
      : t("overview.noProvider")
    : t("projects.indexPath");

  useEffect(() => {
    setActionError(null);
    setActionNotice(null);
  }, [selectedInstance?.instanceId, selectedSkillId]);

  const selectedSkillName = library.find((s) => s.skillId === selectedSkillId)?.name;

  const handleBind = async () => {
    if (!selectedInstance || !selectedSkillId) {
      return;
    }
    setBinding(true);
    setActionError(null);
    setActionNotice(null);
    try {
      await onBind(selectedSkillId);
      setActionNotice(t("projects.successBind", { name: selectedInstance.displayName, skill: selectedSkillName || selectedSkillId }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("projects.bindFailed"));
    } finally {
      setBinding(false);
    }
  };

  const rollbackVersions = useMemo(() => {
    if (!selectedInstance?.linkedSkillId || !selectedSkillDetail) return [];
    if (selectedSkillDetail.skill.skillId !== selectedInstance.linkedSkillId) return [];
    return selectedSkillDetail.versions;
  }, [selectedInstance?.linkedSkillId, selectedSkillDetail]);

  useEffect(() => {
    if (!rollbackVersions.length) {
      setRollbackVersion("");
      return;
    }
    setRollbackVersion((current) =>
      rollbackVersions.some((v) => v.version === current) ? current : rollbackVersions[0].version
    );
  }, [rollbackVersions]);

  const handleRollback = async () => {
    if (!selectedInstance || !rollbackVersion) return;
    setRollingBack(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const message = await onRollbackInstance(selectedInstance.instanceId, rollbackVersion);
      if (message) {
        setActionNotice(message);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("projects.updateFailed"));
    } finally {
      setRollingBack(false);
    }
  };

  const handleUpdateInstance = async (
    event: MouseEvent<HTMLButtonElement>,
    instanceId: string
  ) => {
    event.stopPropagation();
    setUpdatingInstanceId(instanceId);
    setActionError(null);
    try {
      const message = await onUpdateBoundInstance(instanceId);
      setActionNotice(message || null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("projects.updateFailed"));
      setActionNotice(null);
    } finally {
      setUpdatingInstanceId(null);
    }
  };

  const handleInstanceKeyDown = (event: KeyboardEvent<HTMLDivElement>, instance: LocalInstance) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectInstance(instance);
    }
  };

  return (
    <motion.div className="projects-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="projects-workbench panel panel--full-height">
        <div className="projects-workbench__header">
          <div>
            <h2>{snapshot?.workspace.kind === "special" ? t("projects.specialWorkspace") : t("projects.projectWorkspace")}</h2>
          </div>
          <div className="projects-workbench__window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="projects-toolbar">
          <div className="projects-toolbar__path-card">
            <div>
              <span className="projects-toolbar__label">{t("projects.currentPath")}</span>
              <strong>{workspacePathLabel}</strong>
            </div>
            <span className="projects-toolbar__index-path">{workspaceIndexLabel}</span>
          </div>

          <div className="projects-toolbar__actions">
            <button type="button" className="button button--ghost" onClick={onScanWorkspace} disabled={!snapshot}>{t("projects.scan")}</button>
            <button type="button" className="button button--ghost" onClick={onRefreshWorkspace} disabled={!snapshot}>{t("projects.refresh")}</button>
            <button type="button" className="button button--ghost" onClick={onOpenInstall} disabled={!snapshot}>{t("projects.installVersion")}</button>
            <button type="button" className="button button--primary" onClick={onOpenPublish} disabled={!selectedInstance}>{t("projects.publishToGlobal")}</button>
          </div>
        </div>

        <div className="projects-summary-grid">
          <article className="projects-summary-card">
            <span>{t("projects.totalInstance")}</span>
            <strong>{summary.totalCount}</strong>
          </article>
          <article className="projects-summary-card">
            <span>{t("projects.boundGlobal")}</span>
            <strong>{summary.boundCount}</strong>
          </article>
          <article className="projects-summary-card">
            <span>{t("projects.unbound")}</span>
            <strong>{summary.unboundCount}</strong>
          </article>
          <article className="projects-summary-card">
            <span>{snapshot?.workspace.kind === "special" ? t("projects.availableProvider") : t("projects.indexDirectory")}</span>
            <strong>{snapshot?.workspace.kind === "special" ? snapshot?.workspace.availableProviders.length ?? 0 : ".htyskillmanager"}</strong>
            {snapshot?.workspace.kind === "special" && snapshot.workspace.availableProviders.length ? (
              <p>{snapshot.workspace.availableProviders.join(" / ")}</p>
            ) : null}
          </article>
        </div>

        <div className="projects-content-grid">
          <section className="projects-card projects-card--main">
            <div className="panel__header projects-card__header">
              <div><h3>{t("projects.instanceList")}</h3></div>
            </div>

            <div className="projects-provider-tabs" role="tablist" aria-label="provider filter">
              {([
                { key: "all", label: t("projects.allProviders") },
                { key: "codex", label: "Codex" },
                { key: "claude", label: "Claude" },
                { key: "cursor", label: "Cursor" }
              ] as const).map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`projects-provider-tab ${providerFilter === entry.key ? "is-active" : ""}`}
                  onClick={() => setProviderFilter(entry.key)}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="projects-instance-table">
              <div className="projects-instance-table__head">
                <span>{t("projects.headerName")}</span>
                <span>{t("projects.headerProvider")}</span>
                <span>{t("projects.headerIndexVersion")}</span>
                <span>{t("projects.headerAction")}</span>
                <span>{t("projects.headerStatus")}</span>
                <span>{t("projects.headerPath")}</span>
              </div>

              <div className="projects-instance-table__body">
                {filteredInstances.length ? (
                  filteredInstances.map((instance) => (
                    <div
                      key={instance.instanceId}
                      role="button"
                      tabIndex={0}
                      className={`projects-instance-row ${selectedInstance?.instanceId === instance.instanceId ? "is-active" : ""}`}
                      onClick={() => onSelectInstance(instance)}
                      onKeyDown={(event) => handleInstanceKeyDown(event, instance)}
                    >
                      <div className="projects-instance-row__name">
                        <strong>{instance.displayName}</strong>
                      </div>
                      <span>{instance.provider[0].toUpperCase() + instance.provider.slice(1)}</span>
                      <strong>{instance.appliedVersion || "-"}</strong>
                      <div className="projects-instance-row__action">
                        {instance.status === "bound" ? (
                          <button
                            type="button"
                            className="button button--ghost button--row-action"
                            onClick={(event) => handleUpdateInstance(event, instance.instanceId)}
                            disabled={updatingInstanceId === instance.instanceId}
                          >
                            {updatingInstanceId === instance.instanceId ? t("common.processing") : t("projects.update")}
                          </button>
                        ) : (
                          <span className="projects-instance-row__action-placeholder">-</span>
                        )}
                      </div>
                      <span className={`status-badge status-badge--${instance.status}`}>
                        {instance.status === "bound" ? t("common.bound") : instance.status === "lost" ? t("common.lost") : t("common.unbound")}
                      </span>
                      <span className="projects-instance-row__path">{instance.relativePath}</span>
                    </div>
                  ))
                ) : (
                  <div className="projects-instance-table__empty">
                    {workspaces.length && selectedWorkspaceId ? t("projects.noInstancesFound") : t("projects.noWorkspaceConnected")}
                  </div>
                )}
              </div>
              {actionError ? <div className="alert alert--error">{actionError}</div> : null}
              {actionNotice ? <div className="alert alert--info">{actionNotice}</div> : null}
            </div>
          </section>

          <aside className="projects-card projects-card--detail">
            {selectedInstance ? (
              <>
                <div className="projects-detail__hero">
                  <div><h3>{selectedInstance.displayName}</h3></div>
                  <ProviderPills providers={[selectedInstance.provider]} compact />
                </div>

                <div className="projects-detail__block">
                  <span className="projects-detail__label">{t("projects.localPath")}</span>
                  <div className="projects-detail__value-box">{selectedInstance.relativePath}</div>
                </div>

                <div className="projects-detail__block">
                  <span className="projects-detail__label">{t("projects.indexInfo")}</span>
                  <div className="projects-detail__value-box projects-detail__value-box--stack">
                    <span>linkedSkillId: {selectedInstance.linkedSkillId || "-"}</span>
                    <span>appliedVersion: {selectedInstance.appliedVersion || "-"}</span>
                    <span>indexFile: {selectedInstance.indexPath.split("/").pop() || selectedInstance.indexPath}</span>
                    {selectedInstance.status === "lost" && (
                      <span className="projects-detail__lost-hint">{t("projects.lostDesc")}</span>
                    )}
                  </div>
                </div>

                <div className="projects-detail__block">
                  <span className="projects-detail__label">{t("projects.bindExisting")}</span>
                  <select value={selectedSkillId || ""} onChange={(event) => onSelectSkillId(event.target.value)}>
                    <option value="">{t("projects.selectSkill")}</option>
                    {library.map((skill) => (
                      <option key={skill.skillId} value={skill.skillId}>{skill.name}</option>
                    ))}
                  </select>
                </div>

                <div className="projects-detail__actions">
                  <div className="projects-detail__actions-secondary">
                    <button type="button" className="button button--ghost" onClick={handleBind} disabled={!selectedSkillId || binding || selectedInstance.status === "bound"}>
                      {t("projects.bindExisting")}
                    </button>
                  </div>
                </div>

                {selectedInstance.status === "bound" && rollbackVersions.length > 0 && (
                  <div className="projects-detail__block">
                    <span className="projects-detail__label">{t("projects.rollback")}</span>
                    <div className="projects-detail__bind-grid">
                      <select value={rollbackVersion} onChange={(event) => setRollbackVersion(event.target.value)}>
                        {rollbackVersions.map((version) => (
                          <option key={version.version} value={version.version}>{version.version}</option>
                        ))}
                      </select>
                      <button type="button" className="button button--ghost" onClick={handleRollback} disabled={!rollbackVersion || rollingBack || rollbackVersion === selectedInstance.appliedVersion}>
                        {rollingBack ? t("common.processing") : t("projects.rollbackConfirm")}
                      </button>
                    </div>
                  </div>
                )}

                {actionError ? <div className="alert alert--error">{actionError}</div> : null}
                {actionNotice ? <div className="alert alert--info">{actionNotice}</div> : null}
              </>
            ) : (
              <div className="empty-state projects-detail__empty">
                <h3>{t("projects.selectInstance")}</h3>
              </div>
            )}
          </aside>
        </div>
      </section>
    </motion.div>
  );
}
