import { useEffect } from "react";
import { useSettingsStore } from "../store/settings.store";

// Applies the persisted theme/accent choice to the document root as
// data-theme/data-accent attributes — App.css's [data-theme="light"] and
// [data-accent="..."] blocks pick these up as real CSS custom-property
// overrides, so no component needs to know which theme/accent is active.
export function useTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  useEffect(() => {
    if (theme !== "system") {
      document.documentElement.dataset.theme = theme;
      return;
    }
    // "system" follows the OS — resolve now and on every OS change.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}
