import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DownloadFilterStatus, DownloadSortField } from "../lib/download-types";

interface DownloadUiState {
  filterStatus: DownloadFilterStatus;
  sortField: DownloadSortField;
  sortDesc: boolean;
  searchQuery: string;
  addDialogOpen: boolean;
  settingsOpen: boolean;

  setFilterStatus: (status: DownloadFilterStatus) => void;
  setSortField: (field: DownloadSortField) => void;
  setSortDesc: (desc: boolean) => void;
  setSearchQuery: (query: string) => void;
  setAddDialogOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useDownloadStore = create<DownloadUiState>()(
  persist(
    (set) => ({
      filterStatus: "all",
      sortField: "createdAt",
      sortDesc: true,
      searchQuery: "",
      addDialogOpen: false,
      settingsOpen: false,

      setFilterStatus: (filterStatus) => set({ filterStatus }),
      setSortField: (sortField) => set({ sortField }),
      setSortDesc: (sortDesc) => set({ sortDesc }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setAddDialogOpen: (addDialogOpen) => set({ addDialogOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen })
    }),
    {
      name: "hty-download-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        filterStatus: state.filterStatus,
        sortField: state.sortField,
        sortDesc: state.sortDesc
      })
    }
  )
);
