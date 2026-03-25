import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, FolderOpen, Save, Upload, Download } from "lucide-react";
import { syncApi } from "../lib/sync-api";
import { getDesktopBridge } from "../../lib/desktop";
import type { SyncProject, BlacklistTemplate } from "../lib/sync-types";

interface Props {
  project: SyncProject;
}

export function BlacklistPanel({ project }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newEntry, setNewEntry] = useState("");
  const [templateName, setTemplateName] = useState("");

  const blacklistQuery = useQuery({
    queryKey: ["sync-blacklist", project.path],
    queryFn: () => syncApi.loadBlacklist(project.path)
  });

  const templatesQuery = useQuery({
    queryKey: ["sync-templates"],
    queryFn: () => syncApi.loadTemplates()
  });

  const blacklist = blacklistQuery.data ?? [];
  const templates = templatesQuery.data ?? [];

  const saveBlacklist = useMutation({
    mutationFn: (entries: string[]) => syncApi.saveBlacklist(project.path, entries),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sync-blacklist", project.path] })
  });

  const saveTemplates = useMutation({
    mutationFn: (t: BlacklistTemplate[]) => syncApi.saveTemplates(t),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sync-templates"] })
  });

  const handleAdd = () => {
    const entry = newEntry.trim();
    if (!entry || blacklist.includes(entry)) return;
    saveBlacklist.mutate([...blacklist, entry]);
    setNewEntry("");
  };

  const handleBrowse = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const result = await bridge.openDialog({ directory: true, title: t("sync.blacklistTitle") });
    if (!result || Array.isArray(result)) return;
    setNewEntry(result);
  };

  const handleRemove = (entry: string) => {
    saveBlacklist.mutate(blacklist.filter((e) => e !== entry));
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    const existing = templates.findIndex((t) => t.Name === name);
    const newTemplate: BlacklistTemplate = { Name: name, Items: [...blacklist] };
    const updated = [...templates];
    if (existing >= 0) updated[existing] = newTemplate;
    else updated.push(newTemplate);
    saveTemplates.mutate(updated);
    setTemplateName("");
  };

  const handleApplyTemplate = (template: BlacklistTemplate) => {
    saveBlacklist.mutate([...(template.Items || [])]);
  };

  const handleMergeTemplate = (template: BlacklistTemplate) => {
    const merged = [...new Set([...blacklist, ...(template.Items || [])])];
    saveBlacklist.mutate(merged);
  };

  const handleDeleteTemplate = (name: string) => {
    saveTemplates.mutate(templates.filter((t) => t.Name !== name));
  };

  const handleImport = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const filePath = await bridge.openDialog({ title: t("sync.blacklistImport"), filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!filePath || Array.isArray(filePath)) return;
    const imported = await syncApi.importTemplates(filePath);
    const merged = [...templates];
    for (const t of imported) {
      const idx = merged.findIndex((m) => m.Name === t.Name);
      if (idx >= 0) merged[idx] = t;
      else merged.push(t);
    }
    saveTemplates.mutate(merged);
  };

  const handleExport = async () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const filePath = await bridge.saveDialog({ title: t("sync.blacklistExport"), defaultPath: "blacklist_templates.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!filePath) return;
    await syncApi.exportTemplates(filePath, templates);
  };

  return (
    <div className="sync-blacklist-panel">
      <div className="sync-panel-card">
        <h3>{t("sync.blacklistTitle")}</h3>
        <div className="sync-blacklist-add">
          <input
            placeholder={t("sync.blacklistPlaceholder")}
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
          <button className="button button--ghost" onClick={handleBrowse}><FolderOpen size={14} /></button>
          <button className="button button--primary" onClick={handleAdd}><Plus size={14} /> {t("common.add")}</button>
        </div>
        <div className="sync-blacklist-list">
          {blacklist.map((entry) => (
            <div key={entry} className="sync-blacklist-item">
              <span>{entry}</span>
              <button className="sync-row-btn" onClick={() => handleRemove(entry)}><Trash2 size={13} /></button>
            </div>
          ))}
          {blacklist.length === 0 && <div className="sync-empty-text">{t("sync.blacklistNoEntries")}</div>}
        </div>
      </div>

      <div className="sync-panel-card">
        <h3>{t("sync.blacklistTemplates")}</h3>
        <div className="sync-template-save">
          <input placeholder={t("sync.blacklistTemplateName")} value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
          <button className="button button--primary" onClick={handleSaveTemplate}><Save size={14} /> {t("common.save")}</button>
          <button className="button button--ghost" onClick={handleImport}><Upload size={14} /> {t("sync.blacklistImport")}</button>
          <button className="button button--ghost" onClick={handleExport}><Download size={14} /> {t("sync.blacklistExport")}</button>
        </div>
        <div className="sync-template-list">
          {templates.map((tpl) => (
            <div key={tpl.Name} className="sync-template-item">
              <span className="sync-template-item__name">{tpl.Name} ({t("sync.blacklistItemCount", { count: (tpl.Items || []).length })})</span>
              <div className="sync-template-item__actions">
                <button className="sync-text-btn" onClick={() => handleApplyTemplate(tpl)} title={t("sync.apply")}>{t("sync.apply")}</button>
                <button className="sync-text-btn" onClick={() => handleMergeTemplate(tpl)} title={t("sync.blacklistMerge")}>{t("sync.blacklistMerge")}</button>
                <button className="sync-row-btn" onClick={() => handleDeleteTemplate(tpl.Name)} title={t("common.delete")}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {templates.length === 0 && <div className="sync-empty-text">{t("sync.blacklistNoTemplates")}</div>}
        </div>
      </div>
    </div>
  );
}
