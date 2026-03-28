import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { FileText, Loader2, PenTool, Plus, Save, Send, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import type { ComposerFile, Provider, WorkspaceRecord } from "../lib/types";
import { parseFrontmatter, serializeFrontmatter, toKebabCase, renderMarkdown } from "../lib/composer-utils";
import { SKILL_TEMPLATES, type SkillTemplate } from "../lib/composer-templates";
import { useUiStore } from "../state/ui-store";
import { confirm } from "../state/confirm-store";

interface ComposerPageProps {
  workspaces: WorkspaceRecord[];
}

const DEFAULT_FILE: ComposerFile = {
  fileName: "SKILL.md",
  content: "---\nname: my-skill\ndescription: \n---\n\n"
};

export function ComposerPage({ workspaces }: ComposerPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const composerSkillDir = useUiStore((s) => s.composerSkillDir);
  const composerSkillId = useUiStore((s) => s.composerSkillId);
  const setComposerDirty = useUiStore((s) => s.setComposerDirty);
  const isLibraryMode = Boolean(composerSkillId);

  // Editor state
  const [files, setFiles] = useState<ComposerFile[]>([{ ...DEFAULT_FILE }]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [skillName, setSkillName] = useState("my-skill");
  const [description, setDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Save target
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string | null>(null);
  const [targetProvider, setTargetProvider] = useState<Provider>("claude");

  const targetWorkspace = workspaces.find((w) => w.workspaceId === targetWorkspaceId) ?? null;
  const projectWorkspaces = workspaces.filter((w) => w.kind === "project");

  // Auto-select first workspace
  useEffect(() => {
    if (!targetWorkspaceId && projectWorkspaces.length > 0) {
      setTargetWorkspaceId(projectWorkspaces[0].workspaceId);
    }
  }, [targetWorkspaceId, projectWorkspaces]);

  // Load existing skill if composerSkillDir is set
  const loadQuery = useQuery({
    queryKey: ["composer-load", composerSkillDir],
    queryFn: () => api.composerReadSkillDir(composerSkillDir!),
    enabled: Boolean(composerSkillDir)
  });

  useEffect(() => {
    if (loadQuery.data?.files.length) {
      setFiles(loadQuery.data.files);
      setActiveFileIndex(0);
      const main = loadQuery.data.files.find((f) => f.fileName.toLowerCase() === "skill.md") ?? loadQuery.data.files[0];
      if (main) {
        const parsed = parseFrontmatter(main.content);
        setSkillName(parsed.name);
        setDescription(parsed.description);
      }
    }
  }, [loadQuery.data]);

  // Active file
  const activeFile = files[activeFileIndex] ?? files[0];

  // Sync frontmatter when metadata fields change
  const handleMetaChange = useCallback((newName: string, newDesc: string) => {
    setSkillName(newName);
    setDescription(newDesc);
    setComposerDirty(true);

    setFiles((prev) => {
      const mainIndex = prev.findIndex((f) => f.fileName.toLowerCase() === "skill.md");
      if (mainIndex < 0) return prev;
      const parsed = parseFrontmatter(prev[mainIndex].content);
      const updated = [...prev];
      updated[mainIndex] = {
        ...updated[mainIndex],
        content: serializeFrontmatter(newName, newDesc, parsed.body)
      };
      return updated;
    });
  }, [setComposerDirty]);

  // Update file content from editor
  const handleContentChange = useCallback((content: string) => {
    setComposerDirty(true);
    setFiles((prev) => {
      const updated = [...prev];
      updated[activeFileIndex] = { ...updated[activeFileIndex], content };
      return updated;
    });

    // Sync metadata if editing SKILL.md
    if (activeFile?.fileName.toLowerCase() === "skill.md") {
      const parsed = parseFrontmatter(content);
      setSkillName(parsed.name);
      setDescription(parsed.description);
    }
  }, [activeFileIndex, activeFile, setComposerDirty]);

  // Template selection
  const handleSelectTemplate = useCallback((template: SkillTemplate) => {
    setSelectedTemplate(template.id);
    setFiles(template.files.map((f) => ({ ...f })));
    setActiveFileIndex(0);
    const main = template.files[0];
    if (main) {
      const parsed = parseFrontmatter(main.content);
      setSkillName(parsed.name);
      setDescription(parsed.description);
    }
    setComposerDirty(false);
  }, [setComposerDirty]);

  // Add/remove files
  const handleAddFile = useCallback(() => {
    const name = window.prompt(t("composer.newFileName"), "examples.md");
    if (!name?.trim()) return;
    setFiles((prev) => [...prev, { fileName: name.trim(), content: "" }]);
    setActiveFileIndex(files.length);
    setComposerDirty(true);
  }, [files.length, t, setComposerDirty]);

  const handleRemoveFile = useCallback((index: number) => {
    if (files.length <= 1) return;
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setActiveFileIndex((prev) => Math.min(prev, files.length - 2));
    setComposerDirty(true);
  }, [files.length, setComposerDirty]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isLibraryMode && composerSkillDir) {
        // Library mode: save to store + update metadata
        await api.composerWriteSkillDir({ dirPath: composerSkillDir, files });
        await api.composerUpdateSkillMetadata({
          skillId: composerSkillId!,
          name: skillName,
          description
        });
        return { dirPath: composerSkillDir, message: "library skill updated" };
      }
      // Workspace mode
      if (!targetWorkspace) throw new Error("No workspace selected");
      const dirName = toKebabCase(skillName) || "untitled-skill";
      const resolved = await api.composerResolveTargetDir({
        workspaceRoot: targetWorkspace.rootPath,
        provider: targetProvider,
        skillName: dirName
      });
      if (resolved.exists && !composerSkillDir) {
        const ok = await confirm(t("composer.overwriteTitle", { defaultValue: "\u8986\u76d6\u786e\u8ba4" }), t("composer.overwriteConfirm", { name: dirName }));
        if (!ok) throw new Error("cancelled");
      }
      return api.composerWriteSkillDir({ dirPath: resolved.dirPath, files });
    },
    onSuccess: async () => {
      setComposerDirty(false);
      if (isLibraryMode) {
        await queryClient.invalidateQueries({ queryKey: ["library"] });
        await queryClient.invalidateQueries({ queryKey: ["skill", composerSkillId] });
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        await queryClient.invalidateQueries({ queryKey: ["activity"] });
      } else if (targetWorkspace) {
        await queryClient.invalidateQueries({ queryKey: ["workspace", targetWorkspace.rootPath] });
        await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    }
  });

  // Preview HTML
  const previewHtml = useMemo(() => {
    if (!activeFile) return "";
    const parsed = parseFrontmatter(activeFile.content);
    const header = parsed.name
      ? `<div class="composer-preview__meta"><strong>${parsed.name}</strong><p>${parsed.description}</p></div><hr/>`
      : "";
    return header + renderMarkdown(parsed.body || activeFile.content);
  }, [activeFile]);

  const language = useUiStore((s) => s.activeTab); // just to trigger re-render on lang change

  return (
    <motion.div className="page composer-layout" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* Left panel */}
      <aside className="composer-sidebar">
        {isLibraryMode && (
          <div className="composer-sidebar__section">
            <button
              type="button"
              className="button button--ghost"
              style={{ width: "100%" }}
              onClick={() => {
                useUiStore.getState().openComposer(null, null);
                setFiles([{ ...DEFAULT_FILE }]);
                setActiveFileIndex(0);
                setSkillName("my-skill");
                setDescription("");
                setSelectedTemplate(null);
              }}
            >
              <Plus size={14} /> {t("composer.newSkill")}
            </button>
          </div>
        )}

        <div className="composer-sidebar__section">
          <h4>{t("composer.templates")}</h4>
          <div className="composer-template-grid">
            {SKILL_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className={`composer-template-card ${selectedTemplate === tpl.id ? "is-active" : ""}`}
                onClick={() => handleSelectTemplate(tpl)}
              >
                <span>{tpl.nameZh}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="composer-sidebar__section">
          <h4>{t("composer.files")}</h4>
          <div className="composer-file-list">
            {files.map((file, i) => (
              <div key={i} className={`composer-file-item ${i === activeFileIndex ? "is-active" : ""}`}>
                <button type="button" className="composer-file-item__name" onClick={() => setActiveFileIndex(i)}>
                  <FileText size={14} /> {file.fileName}
                </button>
                {files.length > 1 && (
                  <button type="button" className="composer-file-item__remove" onClick={() => handleRemoveFile(i)}>
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="button button--ghost button--sm" onClick={handleAddFile}>
              <Plus size={14} /> {t("composer.addFile")}
            </button>
          </div>
        </div>

        <div className="composer-sidebar__section">
          <h4>{t("composer.metadata")}</h4>
          <label className="composer-meta-field">
            <span>{t("common.name")}</span>
            <input value={skillName} onChange={(e) => handleMetaChange(e.target.value, description)} />
          </label>
          <label className="composer-meta-field">
            <span>{t("common.description")}</span>
            <textarea rows={3} value={description} onChange={(e) => handleMetaChange(skillName, e.target.value)} />
          </label>
        </div>

        {isLibraryMode ? (
          <div className="composer-sidebar__section">
            <h4>{t("composer.editingLibrarySkill")}</h4>
            <p className="composer-mode-hint">{t("composer.libraryModeHint")}</p>
          </div>
        ) : (
          <div className="composer-sidebar__section">
            <h4>{t("composer.saveTarget")}</h4>
            <label className="composer-meta-field">
              <span>{t("composer.workspace")}</span>
              <select value={targetWorkspaceId ?? ""} onChange={(e) => setTargetWorkspaceId(e.target.value || null)}>
                <option value="">--</option>
                {projectWorkspaces.map((w) => (
                  <option key={w.workspaceId} value={w.workspaceId}>{w.name}</option>
                ))}
              </select>
            </label>
            <label className="composer-meta-field">
              <span>Provider</span>
              <select value={targetProvider} onChange={(e) => setTargetProvider(e.target.value as Provider)}>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
                <option value="cursor">Cursor</option>
              </select>
            </label>
          </div>
        )}

        <div className="composer-sidebar__actions">
          <button
            type="button"
            className="button button--primary"
            disabled={saveMutation.isPending || (!isLibraryMode && !targetWorkspace) || !skillName.trim()}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {isLibraryMode ? t("composer.saveToLibrary") : t("composer.save")}
          </button>
        </div>
        {saveMutation.isError && saveMutation.error?.message !== "cancelled" && (
          <div className="alert alert--error">{String(saveMutation.error?.message)}</div>
        )}
        {saveMutation.isSuccess && (
          <div className="alert alert--success">{t("composer.saveSuccess")}</div>
        )}
      </aside>

      {/* Right panel: editor + preview */}
      <div className="composer-main">
        {/* File tabs */}
        <div className="composer-tabs">
          {files.map((file, i) => (
            <button
              key={i}
              type="button"
              className={`composer-tab ${i === activeFileIndex ? "is-active" : ""}`}
              onClick={() => setActiveFileIndex(i)}
            >
              {file.fileName}
            </button>
          ))}
        </div>

        {/* Split: editor + preview */}
        <div className="composer-split">
          <div className="composer-editor-pane">
            <textarea
              className="composer-editor"
              value={activeFile?.content ?? ""}
              onChange={(e) => handleContentChange(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="composer-preview-pane">
            <div
              className="composer-preview"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
