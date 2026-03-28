import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Library,
  FolderOpen,
  Activity,
  Store,
  PenTool,
  Download,
  Upload,
  Search
} from "lucide-react";
import { api } from "../../lib/api";
import { useUiStore } from "../../state/ui-store";
import type { RouteKey } from "../../lib/types";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  action: () => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    setRoute,
    setSelectedSkillId,
    setSelectedWorkspaceId,
    openInstall,
    openPublish
  } = useUiStore();

  const libraryQuery = useQuery({ queryKey: ["library"], queryFn: api.listLibrary });
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: api.listWorkspaces });

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        if (!open) {
          setQuery("");
          setActiveIndex(0);
        }
      }
      if (e.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: "nav:overview", label: t("sidebar.overview"), hint: t("commandPalette.goTo", { defaultValue: "\u8df3\u8f6c" }), icon: <LayoutDashboard size={16} />, action: () => { setRoute("overview" as RouteKey); close(); } },
      { id: "nav:library", label: t("sidebar.library"), hint: t("commandPalette.goTo", { defaultValue: "\u8df3\u8f6c" }), icon: <Library size={16} />, action: () => { setRoute("library" as RouteKey); close(); } },
      { id: "nav:projects", label: t("sidebar.projects", { defaultValue: "\u9879\u76ee" }), hint: t("commandPalette.goTo", { defaultValue: "\u8df3\u8f6c" }), icon: <FolderOpen size={16} />, action: () => { setRoute("projects" as RouteKey); close(); } },
      { id: "nav:market", label: t("sidebar.market"), hint: t("commandPalette.goTo", { defaultValue: "\u8df3\u8f6c" }), icon: <Store size={16} />, action: () => { setRoute("market" as RouteKey); close(); } },
      { id: "nav:composer", label: t("sidebar.composer"), hint: t("commandPalette.goTo", { defaultValue: "\u8df3\u8f6c" }), icon: <PenTool size={16} />, action: () => { setRoute("composer" as RouteKey); close(); } },
      { id: "nav:activity", label: t("sidebar.activity"), hint: t("commandPalette.goTo", { defaultValue: "\u8df3\u8f6c" }), icon: <Activity size={16} />, action: () => { setRoute("activity" as RouteKey); close(); } },
    ];

    const actions: Command[] = [
      { id: "action:install", label: t("projects.installVersion", { defaultValue: "\u5b89\u88c5\u7248\u672c" }), hint: t("commandPalette.action", { defaultValue: "\u64cd\u4f5c" }), icon: <Download size={16} />, action: () => { setRoute("projects" as RouteKey); openInstall(); close(); } },
      { id: "action:publish", label: t("projects.publishToGlobal", { defaultValue: "\u53d1\u5e03\u5230\u5168\u5c40" }), hint: t("commandPalette.action", { defaultValue: "\u64cd\u4f5c" }), icon: <Upload size={16} />, action: () => { setRoute("projects" as RouteKey); openPublish(null); close(); } },
    ];

    const skills: Command[] = (libraryQuery.data ?? []).map((skill) => ({
      id: `skill:${skill.skillId}`,
      label: skill.name,
      hint: skill.latestVersion || "",
      icon: <Library size={16} />,
      action: () => {
        setRoute("library" as RouteKey);
        setSelectedSkillId(skill.skillId);
        close();
      }
    }));

    const ws: Command[] = (workspacesQuery.data ?? [])
      .filter((w) => w.kind !== "special")
      .map((w) => ({
        id: `ws:${w.workspaceId}`,
        label: w.name,
        hint: w.rootPath,
        icon: <FolderOpen size={16} />,
        action: () => {
          setRoute("projects" as RouteKey);
          setSelectedWorkspaceId(w.workspaceId);
          close();
        }
      }));

    return [...nav, ...actions, ...skills, ...ws];
  }, [t, libraryQuery.data, workspacesQuery.data, setRoute, setSelectedSkillId, setSelectedWorkspaceId, openInstall, openPublish, close]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands.filter((cmd) => fuzzyMatch(query, cmd.label) || (cmd.hint && fuzzyMatch(query, cmd.hint)));
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault();
      filtered[activeIndex].action();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="command-palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={close}
        >
          <motion.div
            className="command-palette"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-palette__input-wrap">
              <Search size={16} className="command-palette__search-icon" />
              <input
                ref={inputRef}
                className="command-palette__input"
                placeholder={t("commandPalette.placeholder", { defaultValue: "\u641c\u7d22\u547d\u4ee4\u3001\u6280\u80fd\u3001\u5de5\u4f5c\u533a..." })}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <kbd className="command-palette__kbd">ESC</kbd>
            </div>
            <div className="command-palette__list" ref={listRef}>
              {filtered.length ? (
                filtered.map((cmd, i) => (
                  <div
                    key={cmd.id}
                    className={`command-palette__item ${i === activeIndex ? "is-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={cmd.action}
                  >
                    <span className="command-palette__item-icon">{cmd.icon}</span>
                    <span className="command-palette__item-label">{cmd.label}</span>
                    {cmd.hint && <span className="command-palette__item-hint">{cmd.hint}</span>}
                  </div>
                ))
              ) : (
                <div className="command-palette__empty">
                  {t("commandPalette.noResults", { defaultValue: "\u6ca1\u6709\u5339\u914d\u7684\u7ed3\u679c" })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
