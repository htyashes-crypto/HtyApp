import { useState, useCallback, useMemo, useRef, useEffect, memo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Download, Upload, Search, ChevronDown, ChevronUp, Save, Trash2, Eraser, X, LoaderCircle } from "lucide-react";
import { syncApi } from "../lib/sync-api";
import { useSyncUiStore } from "../state/sync-ui-store";
import { useSyncEvent } from "../hooks/useSyncEvents";
import { DiffViewerDialog } from "../components/DiffViewerDialog";
import { TextPreviewDialog } from "../components/TextPreviewDialog";
import { SyncProgressDialog } from "../components/SyncProgressDialog";
import type { SyncProject, DiffEntry, SyncMode, SyncDirection, SyncSummary, FilterScheme, DiffTexts } from "../lib/sync-types";

// ==================== Constants ====================

const ROW_HEIGHT = 36;
const OVERSCAN = 10;

const SYNC_MODE_KEYS: { value: SyncMode; labelKey: string }[] = [
  { value: "All", labelKey: "sync.allFiles" },
  { value: "Script", labelKey: "sync.scripts" },
  { value: "Meta", labelKey: "sync.meta" },
  { value: "ScriptMeta", labelKey: "sync.scriptMeta" },
  { value: "Other", labelKey: "sync.other" }
];

// ==================== Debounce Hook ====================

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ==================== Virtual Scroll Hook ====================

function useVirtualScroll(totalCount: number, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    setContainerHeight(el.clientHeight);
    return () => ro.disconnect();
  }, [containerRef]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + 2 * OVERSCAN;
  const endIdx = Math.min(totalCount, startIdx + visibleCount);
  const totalHeight = totalCount * ROW_HEIGHT;
  const offsetY = startIdx * ROW_HEIGHT;

  return { startIdx, endIdx, totalHeight, offsetY, handleScroll };
}

// ==================== Context Menu ====================

interface ContextMenuState {
  x: number;
  y: number;
  entry: DiffEntry;
}

interface ContextMenuProps {
  menu: ContextMenuState;
  projectRoot: string;
  repoRoot: string;
  onClose: () => void;
  onAction: (action: string, entry: DiffEntry) => void;
}

function DiffContextMenu({ menu, projectRoot, repoRoot, onClose, onAction }: ContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { entry } = menu;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const isModified = entry.status === "modified";
  const isConflict = entry.status === "conflict";
  const isAdded = entry.status === "added";
  const isDeleted = entry.status === "deleted";

  return (
    <div
      ref={ref}
      className="sync-context-menu"
      style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 100 }}
    >
      <button className="sync-context-menu__item" onClick={() => onAction("open", entry)}>
        {t("sync.ctxOpen")}
      </button>
      <button className="sync-context-menu__item" onClick={() => onAction("reveal", entry)}>
        {t("sync.ctxReveal")}
      </button>
      <div className="sync-context-menu__sep" />
      {(isModified || isConflict) && (
        <button className="sync-context-menu__item" onClick={() => onAction("diff", entry)}>
          {t("sync.ctxDiff")}
        </button>
      )}
      {isConflict && (
        <button className="sync-context-menu__item" onClick={() => onAction("resolve", entry)}>
          {t("sync.ctxResolve")}
        </button>
      )}
      {(isAdded || isDeleted) && (
        <button className="sync-context-menu__item" onClick={() => onAction("preview", entry)}>
          {t("sync.ctxPreview")}
        </button>
      )}
      {(isModified || isConflict || isDeleted) && (
        <button className="sync-context-menu__item" onClick={() => onAction("updateFromRepo", entry)}>
          {t("sync.ctxUpdateFromRepo")}
        </button>
      )}
      {(isModified || isConflict || isAdded) && (
        <button className="sync-context-menu__item" onClick={() => onAction("applyToRepo", entry)}>
          {t("sync.ctxApplyToRepo")}
        </button>
      )}
      <div className="sync-context-menu__sep" />
      <button className="sync-context-menu__item" onClick={() => onAction("copyFull", entry)}>
        {t("sync.ctxCopyFull")}
      </button>
      <button className="sync-context-menu__item" onClick={() => onAction("copyRel", entry)}>
        {t("sync.ctxCopyRel")}
      </button>
    </div>
  );
}

// ==================== Memoized Row ====================

interface DiffRowProps {
  entry: DiffEntry;
  onSync: (entry: DiffEntry, direction: "RepoToProject" | "ProjectToRepo") => void;
  onContextMenu: (e: React.MouseEvent, entry: DiffEntry) => void;
  isSyncing: boolean;
}

const DiffRow = memo(function DiffRow({ entry, onSync, onContextMenu, isSyncing }: DiffRowProps) {
  const { t } = useTranslation();
  return (
    <div
      className="sync-diff-row"
      style={{ height: ROW_HEIGHT }}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      <span className={`sync-diff-col--status sync-status-badge sync-status--${entry.status}`}>
        {entry.status}
      </span>
      <span className="sync-diff-col--path" title={entry.relativePath}>{entry.relativePath}</span>
      <span className="sync-diff-col--size">{(entry.sizeBytes / 1024).toFixed(0)} KB</span>
      <span className="sync-diff-col--changes">{entry.codeChangeSummary}</span>
      <span className="sync-diff-col--actions">
        {isSyncing ? (
          <LoaderCircle size={14} className="spin" style={{ color: "var(--brand-b)" }} />
        ) : (
          <>
            <button className="sync-row-btn" onClick={() => onSync(entry, "RepoToProject")} title={t("sync.updateFromRepo")}>
              <Download size={12} />
            </button>
            <button className="sync-row-btn" onClick={() => onSync(entry, "ProjectToRepo")} title={t("sync.applyToRepo")}>
              <Upload size={12} />
            </button>
          </>
        )}
      </span>
    </div>
  );
});

// ==================== Filter Logic (pure function) ====================

interface FilterState {
  modified: boolean;
  added: boolean;
  deleted: boolean;
  conflict: boolean;
  search: string;
  ext: string;
  path: string;
  sizeMin: string;
  sizeMax: string;
  startDate: string;
  endDate: string;
}

function applyFilters(allDiffs: DiffEntry[], f: FilterState): DiffEntry[] {
  let items = allDiffs;

  if (!f.modified) items = items.filter((d) => d.status !== "modified");
  if (!f.added) items = items.filter((d) => d.status !== "added");
  if (!f.deleted) items = items.filter((d) => d.status !== "deleted");
  if (!f.conflict) items = items.filter((d) => d.status !== "conflict");

  if (f.search) {
    const q = f.search.toLowerCase();
    items = items.filter((d) => d.relativePath.toLowerCase().includes(q));
  }

  if (f.ext) {
    const exts = f.ext.split(/[,;\s]+/).filter(Boolean).map((e) => {
      let ext = e.trim().replace(/^\*/, "");
      if (ext && !ext.startsWith(".")) ext = "." + ext;
      return ext.toLowerCase();
    }).filter(Boolean);
    if (exts.length) {
      items = items.filter((d) => {
        const name = d.relativePath.toLowerCase();
        return exts.some((ext) => name.endsWith(ext));
      });
    }
  }

  if (f.path) {
    const q = f.path.toLowerCase();
    items = items.filter((d) => d.relativePath.toLowerCase().includes(q));
  }

  const minKB = f.sizeMin ? parseFloat(f.sizeMin) : NaN;
  const maxKB = f.sizeMax ? parseFloat(f.sizeMax) : NaN;
  if (!isNaN(minKB)) items = items.filter((d) => d.sizeBytes >= minKB * 1024);
  if (!isNaN(maxKB)) items = items.filter((d) => d.sizeBytes <= maxKB * 1024);

  if (f.startDate) {
    const start = new Date(f.startDate).getTime();
    items = items.filter((d) => new Date(d.modifiedTime).getTime() >= start);
  }
  if (f.endDate) {
    const end = new Date(f.endDate + "T23:59:59").getTime();
    items = items.filter((d) => new Date(d.modifiedTime).getTime() <= end);
  }

  return items;
}

// ==================== Main Component ====================

interface Props {
  project: SyncProject;
  repoPath: string;
}

export function PendingChangesPanel({ project, repoPath }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { syncMode, setSyncMode, pendingSearch, setPendingSearch, isScanning, setIsScanning, scanProgress, setScanProgress } = useSyncUiStore();
  const [showFilters, setShowFilters] = useState(true);

  // --- Filter state ---
  const [filterModified, setFilterModified] = useState(true);
  const [filterAdded, setFilterAdded] = useState(true);
  const [filterDeleted, setFilterDeleted] = useState(true);
  const [filterConflict, setFilterConflict] = useState(true);
  const [filterExt, setFilterExt] = useState("");
  const [filterPath, setFilterPath] = useState("");
  const [filterSizeMin, setFilterSizeMin] = useState("");
  const [filterSizeMax, setFilterSizeMax] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const dSearch = useDebouncedValue(pendingSearch, 200);
  const dExt = useDebouncedValue(filterExt, 200);
  const dPath = useDebouncedValue(filterPath, 200);
  const dSizeMin = useDebouncedValue(filterSizeMin, 200);
  const dSizeMax = useDebouncedValue(filterSizeMax, 200);

  // --- Filter scheme state ---
  const [schemeName, setSchemeName] = useState("");
  const [selectedSchemeIdx, setSelectedSchemeIdx] = useState<number>(-1);

  // --- Context menu state ---
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // --- Dialog state ---
  const [diffDialog, setDiffDialog] = useState<{
    title: string; leftLabel: string; rightLabel: string;
    leftText: string; rightText: string; readOnly: boolean;
    entry: DiffEntry;
  } | null>(null);
  const [previewDialog, setPreviewDialog] = useState<{ title: string; text: string } | null>(null);

  // --- Sync progress dialog state ---
  const [syncDialog, setSyncDialog] = useState<{
    direction: SyncDirection;
    progress: { done: number; total: number };
    summary: SyncSummary | null;
  } | null>(null);

  const schemesQuery = useQuery({
    queryKey: ["sync-filter-schemes"],
    queryFn: syncApi.loadFilterSchemes,
    staleTime: Infinity
  });
  const schemes = schemesQuery.data ?? [];

  const saveSchemesMut = useMutation({
    mutationFn: (s: FilterScheme[]) => syncApi.saveFilterSchemes(s),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sync-filter-schemes"] })
  });

  const buildSchemeFromUi = (name: string): FilterScheme => ({
    Name: name,
    IncludeModified: filterModified, IncludeAdded: filterAdded,
    IncludeDeleted: filterDeleted, IncludeConflict: filterConflict,
    Extensions: filterExt.trim(), PathContains: filterPath.trim(),
    MinSizeKB: filterSizeMin.trim() ? parseFloat(filterSizeMin) : null,
    MaxSizeKB: filterSizeMax.trim() ? parseFloat(filterSizeMax) : null,
    StartDate: filterStartDate || null, EndDate: filterEndDate || null
  });

  const applySchemeToUi = (scheme: FilterScheme) => {
    setSchemeName(scheme.Name ?? "");
    setFilterModified(scheme.IncludeModified); setFilterAdded(scheme.IncludeAdded);
    setFilterDeleted(scheme.IncludeDeleted); setFilterConflict(scheme.IncludeConflict);
    setFilterExt(scheme.Extensions ?? ""); setFilterPath(scheme.PathContains ?? "");
    setFilterSizeMin(scheme.MinSizeKB != null ? String(scheme.MinSizeKB) : "");
    setFilterSizeMax(scheme.MaxSizeKB != null ? String(scheme.MaxSizeKB) : "");
    setFilterStartDate(scheme.StartDate ?? ""); setFilterEndDate(scheme.EndDate ?? "");
  };

  const resetFilters = (clearScheme: boolean) => {
    setFilterModified(true); setFilterAdded(true); setFilterDeleted(true); setFilterConflict(true);
    setFilterExt(""); setFilterPath(""); setFilterSizeMin(""); setFilterSizeMax("");
    setFilterStartDate(""); setFilterEndDate("");
    if (clearScheme) { setSchemeName(""); setSelectedSchemeIdx(-1); }
  };

  const handleSaveScheme = () => {
    const name = schemeName.trim();
    if (!name) return;
    const scheme = buildSchemeFromUi(name);
    const updated = [...schemes];
    const existingIdx = updated.findIndex((s) => s.Name?.toLowerCase() === name.toLowerCase());
    if (existingIdx >= 0) { updated[existingIdx] = scheme; setSelectedSchemeIdx(existingIdx); }
    else { updated.push(scheme); setSelectedSchemeIdx(updated.length - 1); }
    saveSchemesMut.mutate(updated);
  };

  const handleApplyScheme = () => {
    if (selectedSchemeIdx < 0 || selectedSchemeIdx >= schemes.length) return;
    applySchemeToUi(schemes[selectedSchemeIdx]);
  };

  const handleDeleteScheme = () => {
    if (selectedSchemeIdx < 0 || selectedSchemeIdx >= schemes.length) return;
    const updated = schemes.filter((_, i) => i !== selectedSchemeIdx);
    setSelectedSchemeIdx(-1); setSchemeName("");
    saveSchemesMut.mutate(updated);
  };

  // --- Scan progress ---
  const handleScanProgress = useCallback((data: unknown) => {
    const { done, total } = data as { done: number; total: number };
    setScanProgress({ done, total });
  }, [setScanProgress]);

  useSyncEvent("hty:sync:scan-progress", handleScanProgress);

  // --- Bulk sync progress ---
  const handleBulkProgress = useCallback((data: unknown) => {
    const { done, total } = data as { done: number; total: number };
    setSyncDialog(prev => prev ? { ...prev, progress: { done, total } } : prev);
  }, []);

  useSyncEvent("hty:sync:bulk-progress", handleBulkProgress);

  // Cancel running scan when project/repo changes or component unmounts
  const prevKeyRef = useRef(`${project.path}|${repoPath}`);
  useEffect(() => {
    const key = `${project.path}|${repoPath}`;
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      syncApi.cancelScan().catch(() => {});
      setIsScanning(false);
      setScanProgress({ done: 0, total: 0 });
    }
    return () => {
      syncApi.cancelScan().catch(() => {});
    };
  }, [project.path, repoPath, setIsScanning, setScanProgress]);

  const diffsQuery = useQuery({
    queryKey: ["sync-diffs", project.path, repoPath, syncMode],
    queryFn: async () => {
      setIsScanning(true);
      try {
        const blacklist = await syncApi.loadBlacklist(project.path);
        return await syncApi.computeDiffs({ projectRoot: project.path, repoRoot: repoPath, syncMode, blacklistDirs: blacklist });
      } finally { setIsScanning(false); }
    },
    enabled: Boolean(project.path && repoPath),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  });

  const allDiffs = diffsQuery.data ?? [];

  const filterState: FilterState = useMemo(() => ({
    modified: filterModified, added: filterAdded, deleted: filterDeleted, conflict: filterConflict,
    search: dSearch.trim(), ext: dExt.trim(), path: dPath.trim(),
    sizeMin: dSizeMin.trim(), sizeMax: dSizeMax.trim(),
    startDate: filterStartDate, endDate: filterEndDate
  }), [filterModified, filterAdded, filterDeleted, filterConflict, dSearch, dExt, dPath, dSizeMin, dSizeMax, filterStartDate, filterEndDate]);

  const filteredDiffs = useMemo(() => applyFilters(allDiffs, filterState), [allDiffs, filterState]);

  const statusCounts = useMemo(() => {
    const counts = { modified: 0, added: 0, deleted: 0, conflict: 0 };
    for (const d of allDiffs) { if (d.status in counts) counts[d.status as keyof typeof counts]++; }
    return counts;
  }, [allDiffs]);

  // --- Virtual scroll ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const { startIdx, endIdx, totalHeight, offsetY, handleScroll } = useVirtualScroll(filteredDiffs.length, scrollRef);
  const visibleSlice = filteredDiffs.slice(startIdx, endIdx);

  // --- Actions ---
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["sync-diffs", project.path, repoPath, syncMode] });
  };

  const handleBulkSync = async (direction: SyncDirection) => {
    const entries = filteredDiffs.map((d) => d.relativePath);
    if (!entries.length) return;
    setSyncDialog({ direction, progress: { done: 0, total: entries.length }, summary: null });
    try {
      const result = await syncApi.bulkSync({ entries, projectRoot: project.path, repoRoot: repoPath, direction, blacklist: [] });
      setSyncDialog(prev => prev ? { ...prev, summary: result } : prev);
    } catch {
      setSyncDialog(null);
    }
  };

  const handleSyncDialogClose = useCallback(() => {
    setSyncDialog(null);
    queryClient.invalidateQueries({ queryKey: ["sync-diffs", project.path, repoPath, syncMode] });
  }, [queryClient, project.path, repoPath, syncMode]);

  const handleSingleSync = useCallback(async (entry: DiffEntry, direction: SyncDirection) => {
    setSyncDialog({ direction, progress: { done: 0, total: 1 }, summary: null });
    try {
      const result = await syncApi.bulkSync({ entries: [entry.relativePath], projectRoot: project.path, repoRoot: repoPath, direction, blacklist: [] });
      setSyncDialog(prev => prev ? { ...prev, progress: { done: 1, total: 1 }, summary: result } : prev);
    } catch {
      setSyncDialog(null);
    }
  }, [project.path, repoPath, syncMode, queryClient]);

  // --- Context menu handler ---
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: DiffEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleContextAction = useCallback(async (action: string, entry: DiffEntry) => {
    setContextMenu(null);
    const projPath = project.path + "\\" + entry.relativePath;
    const repoFilePath = repoPath + "\\" + entry.relativePath;

    switch (action) {
      case "open": {
        // Open whichever file exists (project first)
        const texts = await syncApi.readDiffTexts(project.path, repoPath, entry.relativePath);
        const target = texts.projectExists ? texts.projectPath : texts.repoExists ? texts.repoPath : null;
        if (target) syncApi.openFile(target);
        break;
      }
      case "reveal": {
        const texts = await syncApi.readDiffTexts(project.path, repoPath, entry.relativePath);
        const target = texts.projectExists ? texts.projectPath : texts.repoExists ? texts.repoPath : null;
        if (target) syncApi.revealFile(target);
        break;
      }
      case "diff": {
        // View diff (read-only for modified, handled by resolve for conflict)
        const texts = await syncApi.readDiffTexts(project.path, repoPath, entry.relativePath);
        if (!texts.projectExists || !texts.repoExists) return;
        if (texts.projectText == null || texts.repoText == null) return;
        setDiffDialog({
          title: t("sync.diffTitle", { file: entry.relativePath }),
          leftLabel: t("sync.repoLabel", { file: entry.relativePath }),
          rightLabel: t("sync.projectLabel", { file: entry.relativePath }),
          leftText: texts.repoText,
          rightText: texts.projectText,
          readOnly: true,
          entry
        });
        break;
      }
      case "resolve": {
        // Conflict resolution — show diff with resolve buttons
        const texts = await syncApi.readDiffTexts(project.path, repoPath, entry.relativePath);
        if (!texts.projectExists || !texts.repoExists) return;
        if (texts.projectText == null || texts.repoText == null) return;
        setDiffDialog({
          title: t("sync.conflictTitle", { file: entry.relativePath }),
          leftLabel: t("sync.repoLabel", { file: entry.relativePath }),
          rightLabel: t("sync.projectLabel", { file: entry.relativePath }),
          leftText: texts.repoText,
          rightText: texts.projectText,
          readOnly: false,
          entry
        });
        break;
      }
      case "preview": {
        // View single file content (added/deleted)
        const texts = await syncApi.readDiffTexts(project.path, repoPath, entry.relativePath);
        let text: string | null = null;
        let prefix = "";
        if (entry.status === "added") {
          text = texts.projectText;
          prefix = t("sync.addedPrefix");
        } else if (entry.status === "deleted") {
          text = texts.repoText;
          prefix = t("sync.deletedPrefix");
        }
        if (text != null) {
          setPreviewDialog({ title: `${prefix}: ${entry.relativePath}`, text });
        }
        break;
      }
      case "updateFromRepo":
        await handleSingleSync(entry, "RepoToProject");
        break;
      case "applyToRepo":
        await handleSingleSync(entry, "ProjectToRepo");
        break;
      case "copyFull": {
        const texts = await syncApi.readDiffTexts(project.path, repoPath, entry.relativePath);
        const target = texts.projectExists ? texts.projectPath : texts.repoPath;
        navigator.clipboard.writeText(target);
        break;
      }
      case "copyRel":
        navigator.clipboard.writeText(entry.relativePath);
        break;
    }
  }, [project.path, repoPath, handleSingleSync, t]);

  // --- Resolve conflict handler ---
  const handleResolveConflict = useCallback(async (keepProject: boolean) => {
    if (!diffDialog) return;
    const entry = diffDialog.entry;
    const direction = keepProject ? "ProjectToRepo" : "RepoToProject";
    setDiffDialog(null);
    await handleSingleSync(entry, direction as "RepoToProject" | "ProjectToRepo");
  }, [diffDialog, handleSingleSync]);

  return (
    <div className="sync-pending-panel">
      {/* ========== Toolbar ========== */}
      <div className="sync-pending-toolbar">
        <select className="sync-mode-select" value={syncMode} onChange={(e) => setSyncMode(e.target.value as SyncMode)}>
          {SYNC_MODE_KEYS.map((m) => <option key={m.value} value={m.value}>{t(m.labelKey)}</option>)}
        </select>
        <div className="sync-search-box">
          <Search size={14} />
          <input placeholder={t("sync.searchPath")} value={pendingSearch} onChange={(e) => setPendingSearch(e.target.value)} />
        </div>
        <button className="button button--ghost" onClick={handleRefresh} disabled={isScanning} title={t("common.refresh")}>
          <RefreshCw size={14} className={isScanning ? "spin" : ""} />
        </button>
        <button className="button button--ghost" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {t("sync.filters")}
        </button>
        <div className="sync-pending-toolbar__spacer" />
        <button className="button button--primary" onClick={() => handleBulkSync("RepoToProject")} disabled={isScanning || syncDialog !== null}>
          <Download size={14} /> {t("sync.updateFromRepo")}
        </button>
        <button className="button button--ghost" onClick={() => handleBulkSync("ProjectToRepo")} disabled={isScanning || syncDialog !== null}>
          <Upload size={14} /> {t("sync.applyToRepo")}
        </button>
      </div>

      {/* ========== Advanced Filters ========== */}
      {showFilters && (
        <div className="sync-filter-section">
          <div className="sync-filter-group-title">{t("sync.advancedFilters")}</div>
          <div className="sync-filter-row">
            <span className="sync-filter-label">{t("sync.status")}</span>
            <label className="sync-checkbox"><input type="checkbox" checked={filterModified} onChange={(e) => setFilterModified(e.target.checked)} /> {t("sync.modified")} ({statusCounts.modified})</label>
            <label className="sync-checkbox"><input type="checkbox" checked={filterAdded} onChange={(e) => setFilterAdded(e.target.checked)} /> {t("sync.added")} ({statusCounts.added})</label>
            <label className="sync-checkbox"><input type="checkbox" checked={filterDeleted} onChange={(e) => setFilterDeleted(e.target.checked)} /> {t("sync.deleted")} ({statusCounts.deleted})</label>
            <label className="sync-checkbox"><input type="checkbox" checked={filterConflict} onChange={(e) => setFilterConflict(e.target.checked)} /> {t("sync.conflict")} ({statusCounts.conflict})</label>
          </div>
          <div className="sync-filter-row">
            <span className="sync-filter-label">{t("sync.extensions")}</span>
            <input className="sync-filter-input" placeholder=".cs, .meta" value={filterExt} onChange={(e) => setFilterExt(e.target.value)} />
            <span className="sync-filter-label">{t("sync.pathContains")}</span>
            <input className="sync-filter-input" placeholder="keyword" value={filterPath} onChange={(e) => setFilterPath(e.target.value)} />
          </div>
          <div className="sync-filter-row">
            <span className="sync-filter-label">{t("sync.sizeKB")}</span>
            <input className="sync-filter-input sync-filter-input--small" type="number" placeholder="min" value={filterSizeMin} onChange={(e) => setFilterSizeMin(e.target.value)} />
            <span className="sync-filter-sep">~</span>
            <input className="sync-filter-input sync-filter-input--small" type="number" placeholder="max" value={filterSizeMax} onChange={(e) => setFilterSizeMax(e.target.value)} />
            <span className="sync-filter-label">{t("sync.date")}</span>
            <input className="sync-filter-input sync-filter-input--date" type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
            <span className="sync-filter-sep">~</span>
            <input className="sync-filter-input sync-filter-input--date" type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
            <button className="button button--ghost sync-filter-btn" onClick={() => resetFilters(false)}><Eraser size={13} /> {t("sync.clear")}</button>
          </div>
          <div className="sync-filter-row sync-filter-row--scheme">
            <span className="sync-filter-label">{t("sync.scheme")}</span>
            <input className="sync-filter-input sync-filter-input--scheme-name" placeholder={t("sync.schemeName")} value={schemeName} onChange={(e) => setSchemeName(e.target.value)} />
            <button className="button button--primary sync-filter-btn" onClick={handleSaveScheme}><Save size={13} /> {t("common.save")}</button>
            <select className="sync-filter-input sync-filter-input--scheme-select" value={selectedSchemeIdx} onChange={(e) => setSelectedSchemeIdx(Number(e.target.value))}>
              <option value={-1}>{t("sync.selectScheme")}</option>
              {schemes.map((s, i) => <option key={i} value={i}>{s.Name}</option>)}
            </select>
            <button className="button button--ghost sync-filter-btn" onClick={handleApplyScheme} disabled={selectedSchemeIdx < 0}>{t("sync.apply")}</button>
            <button className="button button--ghost sync-filter-btn" onClick={handleDeleteScheme} disabled={selectedSchemeIdx < 0}><Trash2 size={13} /> {t("common.delete")}</button>
            <button className="button button--ghost sync-filter-btn" onClick={() => resetFilters(true)}><X size={13} /> {t("sync.reset")}</button>
          </div>
        </div>
      )}

      {/* ========== Progress Bar ========== */}
      {isScanning && (
        <div className="sync-progress-bar">
          <div className="sync-progress-bar__fill" style={{ width: `${scanProgress.total > 0 ? (100 * scanProgress.done / scanProgress.total) : 0}%` }} />
          <div className="sync-progress-bar__text">
            {scanProgress.total > 0 ? t("sync.scanning", { progress: `${Math.round(100 * scanProgress.done / scanProgress.total)}% (${scanProgress.done}/${scanProgress.total})` }) : t("sync.scanningNoProgress")}
          </div>
        </div>
      )}

      {/* ========== Diff List (Virtual Scroll) ========== */}
      <div className="sync-diff-list">
        <div className="sync-diff-list__header">
          <span className="sync-diff-col--status">{t("sync.headerStatus")}</span>
          <span className="sync-diff-col--path">{t("sync.headerPath")}</span>
          <span className="sync-diff-col--size">{t("sync.headerSize")}</span>
          <span className="sync-diff-col--changes">{t("sync.headerChanges")}</span>
          <span className="sync-diff-col--actions">{t("sync.headerActions")}</span>
        </div>
        <div className="sync-diff-list__body" ref={scrollRef} onScroll={handleScroll}>
          <div style={{ height: totalHeight, position: "relative" }}>
            <div style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}>
              {visibleSlice.map((entry) => (
                <DiffRow key={entry.relativePath} entry={entry} onSync={handleSingleSync} onContextMenu={handleContextMenu} isSyncing={false} />
              ))}
            </div>
          </div>
          {!isScanning && filteredDiffs.length === 0 && (
            <div className="sync-empty-text">{t("sync.noEntries")}</div>
          )}
        </div>
      </div>
      <div className="sync-pending-footer">
        {t("sync.entriesCount", { filtered: filteredDiffs.length, total: allDiffs.length })}
      </div>

      {/* ========== Context Menu ========== */}
      {contextMenu && (
        <DiffContextMenu
          menu={contextMenu}
          projectRoot={project.path}
          repoRoot={repoPath}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}

      {/* ========== Diff Viewer Dialog ========== */}
      <DiffViewerDialog
        open={Boolean(diffDialog)}
        title={diffDialog?.title ?? ""}
        leftLabel={diffDialog?.leftLabel ?? ""}
        rightLabel={diffDialog?.rightLabel ?? ""}
        leftText={diffDialog?.leftText ?? ""}
        rightText={diffDialog?.rightText ?? ""}
        readOnly={diffDialog?.readOnly ?? true}
        onClose={() => setDiffDialog(null)}
        onResolve={diffDialog?.readOnly ? undefined : handleResolveConflict}
      />

      {/* ========== Text Preview Dialog ========== */}
      <TextPreviewDialog
        open={Boolean(previewDialog)}
        title={previewDialog?.title ?? ""}
        text={previewDialog?.text ?? ""}
        onClose={() => setPreviewDialog(null)}
      />

      {/* ========== Sync Progress Dialog ========== */}
      <SyncProgressDialog
        open={syncDialog !== null}
        direction={syncDialog?.direction ?? "RepoToProject"}
        progress={syncDialog?.progress ?? { done: 0, total: 0 }}
        summary={syncDialog?.summary ?? null}
        onClose={handleSyncDialogClose}
      />
    </div>
  );
}
