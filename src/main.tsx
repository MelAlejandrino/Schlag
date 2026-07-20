import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Applies the persisted theme/accent before React even mounts — useTheme()'s
// own useEffect (FileExplorerView) only runs after first paint, which would
// otherwise flash the @theme dark defaults for one frame on every launch for
// anyone who's actually set light mode. Reads the same zustand-persist
// localStorage key settings.store.ts writes to; any failure (malformed JSON,
// no persisted state yet) is silently ignored and just falls back to the
// CSS defaults, same as a first-ever run.
try {
  let theme: string | undefined;
  let accent: string | undefined;
  const persisted = localStorage.getItem("schlag.settings");
  if (persisted) {
    const { state } = JSON.parse(persisted);
    theme = state?.theme;
    accent = state?.accent;
  }
  // Default (and "system") follows the OS; an explicit dark/light wins.
  document.documentElement.dataset.theme =
    theme === "dark" || theme === "light"
      ? theme
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.dataset.accent = accent || "green";
} catch {
  // Ignore — falls back to CSS defaults.
  document.documentElement.dataset.accent = "green";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
