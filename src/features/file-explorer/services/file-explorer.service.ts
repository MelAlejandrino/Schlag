import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import type {
  AppSettings,
  ContentSearchResult,
  Entry,
  FileTag,
  IndexStatus,
  QuickAccessDir,
  SearchFilters,
  StorageInfo,
  Tag,
} from "../file-explorer.types";

export const fileExplorerService = {
  quickAccessDirs: () => invoke<QuickAccessDir[]>("quick_access_dirs"),
  listDrives: () => invoke<QuickAccessDir[]>("list_drives"),
  listDir: (path: string) => invoke<Entry[]>("list_dir", { path }),
  // Browsing/opening inside a zip (see lib/zipPath.ts) — archivePath/innerPath
  // are Tauri command *parameter* names, so (unlike SearchFilters' own
  // snake_case struct fields) they're camelCased at the IPC boundary same as
  // keywordMode above, even though the Rust side is snake_case.
  listArchiveDir: (archivePath: string, innerPath: string) =>
    invoke<Entry[]>("list_archive_dir", { archivePath, innerPath }),
  extractZipEntry: (archivePath: string, innerPath: string) =>
    invoke<string>("extract_zip_entry_to_temp", { archivePath, innerPath }),
  openFile: (path: string) => openPath(path),
  openUrl: (url: string) => openUrl(url),
  createDir: (path: string) => invoke<void>("create_dir", { path }),
  createFile: (path: string) => invoke<void>("create_file", { path }),
  renameEntry: (from: string, to: string) => invoke<void>("rename_entry", { from, to }),
  // Returns true if recycled, false if Windows couldn't recycle it (too long /
  // too big) — caller then offers deleteEntryPermanent.
  deleteEntry: (path: string) => invoke<boolean>("delete_entry", { path }),
  deleteEntryPermanent: (path: string) => invoke<void>("delete_entry_permanent", { path }),
  copyEntry: (from: string, to: string) => invoke<void>("copy_entry", { from, to }),
  moveEntry: (from: string, to: string) => invoke<void>("move_entry", { from, to }),
  openWithDialog: (path: string) => invoke<void>("open_with_dialog", { path }),
  showProperties: (path: string) => invoke<void>("show_properties", { path }),
  indexStatus: () => invoke<IndexStatus>("index_status"),
  builtInExcludedDirs: () => invoke<string[]>("built_in_excluded_dirs"),
  searchFiles: (query: string, filters: SearchFilters, keywordMode: boolean) =>
    // Tauri's command-argument matching (distinct from struct-field serde,
    // which this project keeps snake_case end-to-end) camelCases parameter
    // names by default — keyword_mode on the Rust side must be sent as
    // keywordMode here, unlike SearchFilters' own snake_case fields.
    invoke<Entry[]>("search_files", { query, filters, keywordMode }),
  recentFiles: () => invoke<Entry[]>("recent_files"),
  searchContent: (query: string, folder: string | undefined, keywordMode: boolean) =>
    invoke<ContentSearchResult[]>("search_content", { query, folder, keywordMode }),
  // Not an invoke() call, but still a Tauri API — belongs here per this
  // file's own rule (the only place that calls Tauri APIs directly).
  assetUrl: (path: string) => convertFileSrc(path),
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) => invoke<AppSettings>("update_settings", { newSettings: settings }),
  getStorageInfo: () => invoke<StorageInfo>("get_storage_info"),
  // The in-app terminal (terminal.rs) — a real PTY running PowerShell,
  // rendered by TerminalPanel.tsx via xterm.js. onTerminalOutput/onTerminalExit
  // wrap `listen()` the same way every invoke() above is wrapped, since Tauri's
  // event API is also a "Tauri API" per this file's own rule of being the only
  // place that calls one directly. Both use one fixed event name (not a
  // dynamic per-session-id name) with the id in the payload, so a caller can
  // register its listener before it even knows its own session's id — see
  // useTerminalSession.ts for why that ordering matters.
  openTerminal: (cwd: string, cols: number, rows: number) => invoke<number>("terminal_open", { cwd, cols, rows }),
  writeTerminal: (id: number, data: string) => invoke<void>("terminal_write", { id, data }),
  resizeTerminal: (id: number, cols: number, rows: number) => invoke<void>("terminal_resize", { id, cols, rows }),
  closeTerminal: (id: number) => invoke<void>("terminal_close", { id }),
  onTerminalOutput: (onData: (id: number, data: string) => void) =>
    listen<{ id: number; data: string }>("terminal-output", (e) => onData(e.payload.id, e.payload.data)),
  onTerminalExit: (onExit: (id: number) => void) =>
    listen<{ id: number }>("terminal-exit", (e) => onExit(e.payload.id)),
  getTags: () => invoke<Tag[]>("get_tags"),
  createTag: (name: string, color: string) => invoke<Tag>("create_tag", { name, color }),
  deleteTag: (id: number) => invoke<void>("delete_tag", { id }),
  getAllFileTags: () => invoke<FileTag[]>("get_all_file_tags"),
  addFileTag: (path: string, tagId: number) => invoke<void>("add_file_tag", { path, tagId }),
  removeFileTag: (path: string, tagId: number) => invoke<void>("remove_file_tag", { path, tagId }),
};
