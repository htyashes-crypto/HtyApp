import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import i18n from "../i18n";

export type AppTheme = "dark" | "light";
export type AppLanguage = "zh-CN" | "en";

interface ThemeState {
  theme: AppTheme;
  language: AppLanguage;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  setLanguage: (language: AppLanguage) => void;
}

function getPreferredTheme(): AppTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: getPreferredTheme(),
      language: "zh-CN",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set({
          theme: get().theme === "dark" ? "light" : "dark"
        }),
      setLanguage: (language) => {
        i18n.changeLanguage(language);
        set({ language });
      }
    }),
    {
      name: "hty-theme",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme, language: state.language })
    }
  )
);
