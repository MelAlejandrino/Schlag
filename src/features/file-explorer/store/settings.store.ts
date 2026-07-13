import { create } from "zustand";
import { persist } from "zustand/middleware";
import { fileExplorerService } from "../services/file-explorer.service";
import type { AppSettings, StorageInfo } from "../file-explorer.types";
import type { SortDirection, SortKey } from "../lib/sortEntries";
import type { GroupBy } from "../lib/groupEntries";
import type { ViewMode } from "./file-explorer.store";

export type StartupBehavior = "this-pc" | "last-folder" | "custom";
export type SettingsSection = "about" | "appearance" | "general" | "indexing" | "storage" | "guide";

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

  // Backend settings (synced from Rust on load/save)
  excludedDirs: string[];

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
  addExcludedDir: (name: string) => void;
  removeExcludedDir: (name: string) => void;
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

      excludedDirs: [],
      storageInfo: null,

      setActiveSection: (section) => set({ activeSection: section }),

      loadSettings: async () => {
        try {
          const backend: AppSettings = await fileExplorerService.getSettings();
          set({ excludedDirs: backend.excluded_dirs });
        } catch (e) {
          console.warn("Failed to load backend settings:", e);
        }
      },

      saveSettings: async () => {
        const { excludedDirs } = get();
        try {
          await fileExplorerService.updateSettings({ excluded_dirs: excludedDirs });
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

      addExcludedDir: (name) => {
        const trimmed = name.trim().toLowerCase();
        if (!trimmed) return;
        const { excludedDirs } = get();
        if (excludedDirs.includes(trimmed)) return;
        set({ excludedDirs: [...excludedDirs, trimmed] });
      },

      removeExcludedDir: (name) => {
        set({ excludedDirs: get().excludedDirs.filter((d) => d !== name) });
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
      }),
    },
  ),
);
