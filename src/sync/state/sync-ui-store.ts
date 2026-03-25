import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SyncPanel, SyncMode } from "../lib/sync-types";

interface SyncUiState {
  selectedProjectName: string | null;
  syncPanel: SyncPanel;
  syncMode: SyncMode;
  pendingSearch: string;
  isScanning: boolean;
  scanProgress: { done: number; total: number };
  isBulkSyncing: boolean;

  setSelectedProjectName: (name: string | null) => void;
  setSyncPanel: (panel: SyncPanel) => void;
  setSyncMode: (mode: SyncMode) => void;
  setPendingSearch: (search: string) => void;
  setIsScanning: (scanning: boolean) => void;
  setScanProgress: (progress: { done: number; total: number }) => void;
  setIsBulkSyncing: (syncing: boolean) => void;
}

export const useSyncUiStore = create<SyncUiState>()(
  persist(
    (set) => ({
      selectedProjectName: null,
      syncPanel: "timeline",
      syncMode: "All",
      pendingSearch: "",
      isScanning: false,
      scanProgress: { done: 0, total: 0 },
      isBulkSyncing: false,

      setSelectedProjectName: (selectedProjectName) => set({ selectedProjectName }),
      setSyncPanel: (syncPanel) => set({ syncPanel }),
      setSyncMode: (syncMode) => set({ syncMode }),
      setPendingSearch: (pendingSearch) => set({ pendingSearch }),
      setIsScanning: (isScanning) => set({ isScanning }),
      setScanProgress: (scanProgress) => set({ scanProgress }),
      setIsBulkSyncing: (isBulkSyncing) => set({ isBulkSyncing })
    }),
    {
      name: "hty-sync-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedProjectName: state.selectedProjectName,
        syncPanel: state.syncPanel,
        syncMode: state.syncMode
      })
    }
  )
);
