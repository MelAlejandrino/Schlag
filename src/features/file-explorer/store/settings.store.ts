import { create } from "zustand";
import { persist } from "zustand/middleware";
import { fileExplorerService } from "../services/file-explorer.service";
import type { AppSettings, StorageInfo } from "../file-explorer.types";
import type { SortDirection, SortKey } from "../lib/sortEntries";
import type { GroupBy } from "../lib/groupEntries";
import type { ViewMode } from "./file-explorer.store";

export type StartupBehavior = "this-pc" | "last-folder" | "custom";
export type SettingsSection = "about" | "appearance" | "general" | "indexing" | "storage" | "guide";
export type Theme = "dark" | "light";
export type Accent = "indigo" | "green" | "orange" | "pink";

interface SettingsState {
  // Which section of the settings page is active.
  activeSection: SettingsSection;

  // Frontend-only defaults (persisted via zustand persist)
  defaultSortKey: SortKey;
  defaultSortDirection: SortDirection;
  defaultGroupBy: GroupBy;
  defaultViewMode: ViewMode;
  startupBehavior: StartupBehavior;
  startupPath: string;
  theme: Theme;
  accent: Accent;

  // Backend settings (synced from Rust on load/save)
  excludedDirs: string[];
  excludedPaths: string[];

  // Storage info (fetched on demand)
  storageInfo: StorageInfo | null;

  // Actions
  setActiveSection: (section: SettingsSection) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  loadStorageInfo: () => Promise<void>;
  setDefaultSortKey: (key: SortKey) => void;
  setDefaultSortDirection: (dir: SortDirection) => void;
  setDefaultGroupBy: (groupBy: GroupBy) => void;
  setDefaultViewMode: (mode: ViewMode) => void;
  setStartupBehavior: (behavior: StartupBehavior) => void;
  setStartupPath: (path: string) => void;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  addExcludedDir: (name: string) => void;
  removeExcludedDir: (name: string) => void;
  addExcludedPath: (path: string) => void;
  removeExcludedPath: (path: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      activeSection: "general",

      defaultSortKey: "name",
      defaultSortDirection: "asc",
      defaultGroupBy: "none",
      defaultViewMode: "list",
      startupBehavior: "this-pc",
      startupPath: "",
      theme: "dark",
      accent: "indigo",

      excludedDirs: [],
      excludedPaths: [],
      storageInfo: null,

      setActiveSection: (section) => set({ activeSection: section }),

      loadSettings: async () => {
        try {
          const backend: AppSettings = await fileExplorerService.getSettings();
          set({ excludedDirs: backend.excluded_dirs, excludedPaths: backend.excluded_paths });
        } catch (e) {
          console.warn("Failed to load backend settings:", e);
        }
      },

      saveSettings: async () => {
        const { excludedDirs, excludedPaths } = get();
        try {
          await fileExplorerService.updateSettings({
            excluded_dirs: excludedDirs,
            excluded_paths: excludedPaths,
          });
        } catch (e) {
          console.warn("Failed to save backend settings:", e);
        }
      },

      loadStorageInfo: async () => {
        try {
          const info = await fileExplorerService.getStorageInfo();
          set({ storageInfo: info });
        } catch (e) {
          console.warn("Failed to load storage info:", e);
        }
      },

      setDefaultSortKey: (key) => set({ defaultSortKey: key }),
      setDefaultSortDirection: (dir) => set({ defaultSortDirection: dir }),
      setDefaultGroupBy: (groupBy) => set({ defaultGroupBy: groupBy }),
      setDefaultViewMode: (mode) => set({ defaultViewMode: mode }),
      setStartupBehavior: (behavior) => set({ startupBehavior: behavior }),
      setStartupPath: (path) => set({ startupPath: path }),
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),

      addExcludedDir: (name) => {
        const trimmed = name.trim().toLowerCase();
        if (!trimmed) return;
        const { excludedDirs } = get();
        if (excludedDirs.includes(trimmed)) return;
        set({ excludedDirs: [...excludedDirs, trimmed] });
        get().saveSettings();
      },

      removeExcludedDir: (name) => {
        set({ excludedDirs: get().excludedDirs.filter((d) => d !== name) });
        get().saveSettings();
      },

      // Paths keep their original casing (for display) — dedup/comparison
      // is still case-insensitive, matching Windows' own path semantics and
      // indexer.rs's normalize_path. Trailing separator is stripped so
      // "D:\ISOs" and "D:\ISOs\" aren't treated as two different entries.
      addExcludedPath: (path) => {
        const trimmed = path.trim().replace(/[\\/]+$/, "");
        if (!trimmed) return;
        const { excludedPaths } = get();
        if (excludedPaths.some((p) => p.toLowerCase() === trimmed.toLowerCase())) return;
        set({ excludedPaths: [...excludedPaths, trimmed] });
        get().saveSettings();
      },

      removeExcludedPath: (path) => {
        set({ excludedPaths: get().excludedPaths.filter((p) => p !== path) });
        get().saveSettings();
      },
    }),
    {
      name: "schlag.settings",
      partialize: (state) => ({
        defaultSortKey: state.defaultSortKey,
        defaultSortDirection: state.defaultSortDirection,
        defaultGroupBy: state.defaultGroupBy,
        defaultViewMode: state.defaultViewMode,
        startupBehavior: state.startupBehavior,
        startupPath: state.startupPath,
        theme: state.theme,
        accent: state.accent,
      }),
    },
  ),
);
