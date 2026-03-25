import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./zh-CN.json";
import en from "./en.json";

function resolveInitialLanguage(): string {
  try {
    const raw = window.localStorage.getItem("hty-theme");
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { language?: string } };
      if (parsed.state?.language) return parsed.state.language;
    }
  } catch { /* ignore */ }
  return "zh-CN";
}

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    en: { translation: en },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
});

export default i18n;
