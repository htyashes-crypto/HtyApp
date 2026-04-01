import { useCallback, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { downloadApi } from "./lib/download-api";
import { useDownloadStore } from "./state/download-store";
import { useDownloadEvent } from "./hooks/useDownloadEvents";
import { DownloadToolbar } from "./components/DownloadToolbar";
import { DownloadList } from "./components/DownloadList";
import { AddDownloadDialog } from "./components/AddDownloadDialog";
import { DownloadSettingsPanel } from "./components/DownloadSettingsPanel";
import type { DownloadItem, DownloadProgress } from "./lib/download-types";

export function DownloadApp() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { filterStatus, searchQuery, addDialogOpen, settingsOpen, setAddDialogOpen, setSettingsOpen } = useDownloadStore();

  const progressMap = useRef<Map<string, DownloadProgress>>(new Map());

  const itemsQuery = useQuery({
    queryKey: ["downloads"],
    queryFn: downloadApi.list,
    refetchInterval: 3000
  });

  const settingsQuery = useQuery({
    queryKey: ["download-settings"],
    queryFn: downloadApi.getSettings
  });

  const items = itemsQuery.data ?? [];
  const settings = settingsQuery.data;

  // Real-time progress events
  const handleProgress = useCallback((data: unknown) => {
    const p = data as DownloadProgress;
    progressMap.current.set(p.id, p);
    queryClient.setQueryData<DownloadItem[]>(["downloads"], (old) => {
      if (!old) return old;
      return old.map((item) => {
        const progress = progressMap.current.get(item.id);
        if (!progress) return item;
        return {
          ...item,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          speed: progress.speed,
          segments: progress.segments,
          status: progress.status
        };
      });
    });
  }, [queryClient]);

  const handleComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["downloads"] });
  }, [queryClient]);

  const handleError = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["downloads"] });
  }, [queryClient]);

  useDownloadEvent("hty:dl:progress", handleProgress);
  useDownloadEvent("hty:dl:complete", handleComplete);
  useDownloadEvent("hty:dl:error", handleError);

  // Mutations
  const pauseAllMutation = useMutation({
    mutationFn: downloadApi.pauseAll,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["downloads"] })
  });

  const resumeAllMutation = useMutation({
    mutationFn: downloadApi.resumeAll,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["downloads"] })
  });

  const clearCompletedMutation = useMutation({
    mutationFn: downloadApi.clearCompleted,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["downloads"] })
  });

  // Filter & search
  const filtered = useMemo(() => {
    let list = items;
    if (filterStatus !== "all") {
      list = list.filter((i) => i.status === filterStatus);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => i.fileName.toLowerCase().includes(q) || i.url.toLowerCase().includes(q));
    }
    return list;
  }, [items, filterStatus, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    let active = 0;
    let pending = 0;
    let completed = 0;
    for (const item of items) {
      if (item.status === "downloading") active++;
      else if (item.status === "pending") pending++;
      else if (item.status === "completed") completed++;
    }
    return { active, pending, completed };
  }, [items]);

  return (
    <div className="dl-app">
      <DownloadToolbar
        onAdd={() => setAddDialogOpen(true)}
        onPauseAll={() => pauseAllMutation.mutate()}
        onResumeAll={() => resumeAllMutation.mutate()}
        onClearCompleted={() => clearCompletedMutation.mutate()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="dl-app__body">
        {filtered.length === 0 ? (
          <div className="dl-app__empty">{t("download.empty")}</div>
        ) : (
          <DownloadList items={filtered} />
        )}
      </div>

      <div className="dl-app__status-bar">
        <span>{t("download.filterDownloading")} {stats.active}</span>
        <span>{t("download.status_pending")} {stats.pending}</span>
        <span>{t("download.filterCompleted")} {stats.completed}</span>
      </div>

      {addDialogOpen && (
        <AddDownloadDialog
          defaultSaveDir={settings?.defaultSaveDir ?? ""}
          defaultSegments={settings?.defaultSegmentCount ?? 4}
          onClose={() => setAddDialogOpen(false)}
        />
      )}

      {settingsOpen && settings && (
        <DownloadSettingsPanel
          settings={settings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
