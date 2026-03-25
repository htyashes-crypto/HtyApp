import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { AppProviders } from "./app/providers";
import "./i18n";
import "./styles/index.css";

function resolveInitialTheme(): "dark" | "light" {
  if (typeof window === "undefined") {
    return "dark";
  }

  try {
    const raw = window.localStorage.getItem("hty-theme");
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { theme?: "dark" | "light" } };
      if (parsed.state?.theme === "dark" || parsed.state?.theme === "light") {
        return parsed.state.theme;
      }
    }
  } catch {
    // ignore invalid persisted theme payloads and fall back to system preference
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const initialTheme = resolveInitialTheme();
document.documentElement.dataset.theme = initialTheme;
document.documentElement.style.colorScheme = initialTheme;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);
