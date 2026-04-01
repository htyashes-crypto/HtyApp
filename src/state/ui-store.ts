import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { RouteKey } from "../lib/types";

export type AppTab = "skill" | "sync" | "tasks" | "marks" | "memos" | "game";

interface UiState {
  activeTab: AppTab;
  route: RouteKey;
  search: string;
  selectedSkillId: string | null;
  selectedWorkspaceId: string | null;
  publishOpen: boolean;
  installOpen: boolean;
  selectedInstanceId: string | null;
  autoApprove: boolean;
  composerSkillDir: string | null;
  composerSkillId: string | null;
  composerDirty: boolean;
  setActiveTab: (tab: AppTab) => void;
  setRoute: (route: RouteKey) => void;
  setSearch: (search: string) => void;
  setSelectedSkillId: (skillId: string | null) => void;
  setSelectedWorkspaceId: (workspaceId: string | null) => void;
  openPublish: (instanceId: string | null) => void;
  closePublish: () => void;
  openInstall: () => void;
  closeInstall: () => void;
  setAutoApprove: (autoApprove: boolean) => void;
  openComposer: (skillDir?: string | null, skillId?: string | null) => void;
  setComposerDirty: (dirty: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeTab: "skill" as AppTab,
      route: "overview",
      search: "",
      selectedSkillId: null,
      selectedWorkspaceId: null,
      publishOpen: false,
      installOpen: false,
      selectedInstanceId: null,
      autoApprove: false,
      composerSkillDir: null,
      composerSkillId: null,
      composerDirty: false,
      setActiveTab: (activeTab) => set({ activeTab }),
      setRoute: (route) => set({ route }),
      setSearch: (search) => set({ search }),
      setSelectedSkillId: (selectedSkillId) => set({ selectedSkillId }),
      setSelectedWorkspaceId: (selectedWorkspaceId) => set({ selectedWorkspaceId }),
      openPublish: (selectedInstanceId) => set({ publishOpen: true, selectedInstanceId }),
      closePublish: () => set({ publishOpen: false }),
      openInstall: () => set({ installOpen: true }),
      closeInstall: () => set({ installOpen: false }),
      setAutoApprove: (autoApprove) => set({ autoApprove }),
      openComposer: (skillDir, skillId) => set({ route: "composer", composerSkillDir: skillDir ?? null, composerSkillId: skillId ?? null, composerDirty: false }),
      setComposerDirty: (composerDirty) => set({ composerDirty })
    }),
    {
      name: "hty-ui-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeTab: state.activeTab, autoApprove: state.autoApprove })
    }
  )
);
