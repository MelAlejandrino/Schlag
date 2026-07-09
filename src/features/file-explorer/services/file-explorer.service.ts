import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import type {
  ArchiveEntry,
  ContentSearchResult,
  Entry,
  IndexStatus,
  QuickAccessDir,
  SearchFilters,
} from "../file-explorer.types";

export const fileExplorerService = {
  homeDir: () => invoke<string>("home_dir"),
  quickAccessDirs: () => invoke<QuickAccessDir[]>("quick_access_dirs"),
  listDrives: () => invoke<QuickAccessDir[]>("list_drives"),
  listDir: (path: string) => invoke<Entry[]>("list_dir", { path }),
  openFile: (path: string) => openPath(path),
  createDir: (path: string) => invoke<void>("create_dir", { path }),
  createFile: (path: string) => invoke<void>("create_file", { path }),
  renameEntry: (from: string, to: string) => invoke<void>("rename_entry", { from, to }),
  deleteEntry: (path: string) => invoke<void>("delete_entry", { path }),
  copyEntry: (from: string, to: string) => invoke<void>("copy_entry", { from, to }),
  moveEntry: (from: string, to: string) => invoke<void>("move_entry", { from, to }),
  openWithDialog: (path: string) => invoke<void>("open_with_dialog", { path }),
  showProperties: (path: string) => invoke<void>("show_properties", { path }),
  indexStatus: () => invoke<IndexStatus>("index_status"),
  searchFiles: (query: string, filters: SearchFilters, keywordMode: boolean) =>
    // Tauri's command-argument matching (distinct from struct-field serde,
    // which this project keeps snake_case end-to-end) camelCases parameter
    // names by default — keyword_mode on the Rust side must be sent as
    // keywordMode here, unlike SearchFilters' own snake_case fields.
    invoke<Entry[]>("search_files", { query, filters, keywordMode }),
  searchContent: (query: string, folder: string | undefined, keywordMode: boolean) =>
    invoke<ContentSearchResult[]>("search_content", { query, folder, keywordMode }),
  previewText: (path: string) => invoke<string | null>("preview_text", { path }),
  // Rust's (Vec<ArchiveEntry>, bool) return type serializes as a 2-element
  // JSON array via serde, not an object — the tuple shape carries through.
  listArchiveEntries: (path: string) => invoke<[ArchiveEntry[], boolean]>("list_archive_entries", { path }),
  // Not an invoke() call, but still a Tauri API — belongs here per this
  // file's own rule (the only place that calls Tauri APIs directly).
  assetUrl: (path: string) => convertFileSrc(path),
};
