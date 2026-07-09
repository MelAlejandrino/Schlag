import { create } from "zustand/react";
import { persist } from "zustand/middleware";
import { fileExplorerService } from "../services/file-explorer.service";
import { dirname } from "../lib/path";
import type { PromptKind } from "../lib/promptConfig";
import { sortEntries, type SortDirection, type SortKey } from "../lib/sortEntries";
import { compareGroupKeys, groupKeyFor, type GroupBy } from "../lib/groupEntries";
import {
  THIS_PC,
  type ClipboardOp,
  type ClipboardState,
  type ContextMenuState,
  type Entry,
  type QuickAccessDir,
} from "../file-explorer.types";

export type ViewMode = "list" | "medium" | "large";

// This PC has no real directory listing — everything else does.
function loadEntries(path: string): Promise<Entry[]> {
  return path === THIS_PC ? Promise.resolve([]) : fileExplorerService.listDir(path);
}

// Sort, then (if grouping) a second stable sort by group key — JS's
// Array.prototype.sort is spec-stable, so this produces "grouped, then
// sorted within each group" in two simple passes rather than a manual
// group-then-sort-each-bucket tree. Called at every entries-set point so
// store.entries is *always* in the current display order — selectRange's
// shift-click range-select slices this array by index, so the actual order
// must already reflect sort+group or range-select would visually disagree
// with what's between the two clicked rows. groupOrder is a separate
// direction from sortDirection on purpose — which group comes first
// ("Today" vs "Earlier") is a different question from which order entries
// appear in *within* a group.
function organizeEntries(
  entries: Entry[],
  sortKey: SortKey,
  sortDirection: SortDirection,
  groupBy: GroupBy,
  groupOrder: SortDirection,
): Entry[] {
  const sorted = sortEntries(entries, sortKey, sortDirection);
  if (groupBy === "none") return sorted;
  return [...sorted].sort((a, b) =>
    compareGroupKeys(groupKeyFor(a, groupBy), groupKeyFor(b, groupBy), groupBy, groupOrder),
  );
}

interface FileExplorerState {
  currentPath: string;
  addressInput: string;
  entries: Entry[];
  quickAccess: QuickAccessDir[];
  drives: QuickAccessDir[];
  favorites: string[];
  // Persisted the same way favorites is — a lasting per-user preference, not
  // per-session state. Default matches DESIGN.md's sidebar-width token.
  sidebarWidth: number;
  // Same lasting-preference persistence as sidebarWidth/favorites. Default
  // matches usePreviewResize's MIN_WIDTH-adjacent starting size.
  previewOpen: boolean;
  previewWidth: number;
  // A single global preference, not per-folder memory like real Explorer —
  // a stated v1 scope limit, not an oversight. Persisted the same
  // lasting-preference way as sidebarWidth/previewOpen.
  sortKey: SortKey;
  sortDirection: SortDirection;
  groupBy: GroupBy;
  // Separate from sortDirection — which group appears first (e.g. "Today"
  // vs "Earlier") is a different question from which order entries appear
  // in within a group; conflating them was reported as surprising.
  groupOrder: SortDirection;
  viewMode: ViewMode;
  history: string[];
  historyIndex: number;
  error: string | null;
  contextMenu: ContextMenuState | null;
  activePrompt: PromptKind | null;
  // Set when a prompt/delete-confirm targets one specific entry rather than
  // the ambient selection (e.g. "Rename"/"Delete" from a search result's
  // context menu, where the entry isn't in `entries` at all) — null means
  // "use the current selection", the original behavior.
  promptTarget: Entry | null;
  clipboard: ClipboardState | null;
  deleteConfirmOpen: boolean;
  deleteTarget: Entry[] | null;
  selectedPaths: string[];
  selectionAnchor: string | null;
  initialized: boolean;

  init: () => Promise<void>;
  navigate: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  setAddressInput: (value: string) => void;
  setSidebarWidth: (width: number) => void;
  togglePreview: () => void;
  setPreviewWidth: (width: number) => void;
  setSortKey: (key: SortKey) => void;
  setSortDirection: (direction: SortDirection) => void;
  toggleSortDirection: () => void;
  setGroupBy: (groupBy: GroupBy) => void;
  setGroupOrder: (direction: SortDirection) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleFavorite: (path: string) => void;
  openContextMenu: (x: number, y: number, background?: boolean) => void;
  closeContextMenu: () => void;
  openPrompt: (kind: PromptKind, target?: Entry) => void;
  closePrompt: () => void;
  setClipboard: (paths: string[], op: ClipboardOp) => void;
  clearClipboard: () => void;
  openDeleteConfirm: (target?: Entry[]) => void;
  closeDeleteConfirm: () => void;
  selectOnly: (path: string) => void;
  toggleSelect: (path: string) => void;
  selectRange: (path: string) => void;
  ensureSelected: (path: string) => void;
  clearSelection: () => void;
  clearError: () => void;
}

export const useFileExplorerStore = create<FileExplorerState>()(
  persist(
    (set, get) => ({
      currentPath: "",
      addressInput: "",
      entries: [],
      quickAccess: [],
      drives: [],
      favorites: [],
      sidebarWidth: 240,
      previewOpen: false,
      previewWidth: 320,
      sortKey: "name",
      sortDirection: "asc",
      groupBy: "none",
      groupOrder: "asc",
      viewMode: "list",
      history: [],
      historyIndex: -1,
      error: null,
      contextMenu: null,
      activePrompt: null,
      promptTarget: null,
      clipboard: null,
      deleteConfirmOpen: false,
      deleteTarget: null,
      selectedPaths: [],
      selectionAnchor: null,
      initialized: false,

      // useFileExplorer() (the business-logic hook) is now called from both
      // FileExplorerView and SearchModal — both mount at startup, so this
      // must be idempotent, not just "only called once by convention." The
      // flag is set synchronously, before the first await, so a second call
      // arriving before the first one's async work resolves still sees it
      // and bails immediately, rather than double-fetching quickAccess/
      // drives and double-navigating to THIS_PC.
      init: async () => {
        if (get().initialized) return;
        set({ initialized: true });
        try {
          const [quickAccess, drives] = await Promise.all([
            fileExplorerService.quickAccessDirs(),
            fileExplorerService.listDrives(),
          ]);
          set({ quickAccess, drives });
          await get().navigate(THIS_PC);
        } catch (e) {
          set({ error: String(e) });
        }
      },

      navigate: async (path: string) => {
        try {
          const raw = await loadEntries(path);
          const { history, historyIndex, sortKey, sortDirection, groupBy, groupOrder } = get();
          const entries = organizeEntries(raw, sortKey, sortDirection, groupBy, groupOrder);
          const nextHistory = [...history.slice(0, historyIndex + 1), path];
          set({
            entries,
            currentPath: path,
            addressInput: path === THIS_PC ? "This PC" : path,
            history: nextHistory,
            historyIndex: nextHistory.length - 1,
            error: null,
            selectedPaths: [],
            selectionAnchor: null,
          });
        } catch (e) {
          set({ error: String(e) });
        }
      },

      refresh: async () => {
        const { currentPath, sortKey, sortDirection, groupBy, groupOrder } = get();
        if (currentPath === THIS_PC) return;
        try {
          const raw = await loadEntries(currentPath);
          set({ entries: organizeEntries(raw, sortKey, sortDirection, groupBy, groupOrder), error: null });
        } catch (e) {
          set({ error: String(e) });
        }
      },

      goBack: () => {
        const { history, historyIndex } = get();
        if (historyIndex <= 0) return;
        const idx = historyIndex - 1;
        const path = history[idx];
        set({ historyIndex: idx, selectedPaths: [], selectionAnchor: null });
        loadEntries(path)
          .then((raw) => {
            const { sortKey, sortDirection, groupBy, groupOrder } = get();
            set({
              entries: organizeEntries(raw, sortKey, sortDirection, groupBy, groupOrder),
              currentPath: path,
              addressInput: path === THIS_PC ? "This PC" : path,
            });
          })
          .catch((e) => set({ error: String(e) }));
      },

      goForward: () => {
        const { history, historyIndex } = get();
        if (historyIndex >= history.length - 1) return;
        const idx = historyIndex + 1;
        const path = history[idx];
        set({ historyIndex: idx, selectedPaths: [], selectionAnchor: null });
        loadEntries(path)
          .then((raw) => {
            const { sortKey, sortDirection, groupBy, groupOrder } = get();
            set({
              entries: organizeEntries(raw, sortKey, sortDirection, groupBy, groupOrder),
              currentPath: path,
              addressInput: path === THIS_PC ? "This PC" : path,
            });
          })
          .catch((e) => set({ error: String(e) }));
      },

      goUp: () => {
        const current = get().currentPath;
        if (current === THIS_PC) return;
        const parent = dirname(current);
        get().navigate(parent === "" ? THIS_PC : parent);
      },

      setAddressInput: (value: string) => set({ addressInput: value }),
      setSidebarWidth: (width: number) => set({ sidebarWidth: width }),
      togglePreview: () => set({ previewOpen: !get().previewOpen }),
      setPreviewWidth: (width: number) => set({ previewWidth: width }),

      // Always resets to ascending — matches Explorer's own convention of a
      // fresh column always starting ascending, rather than carrying over
      // whatever direction the previous column happened to be in.
      setSortKey: (key: SortKey) => {
        const { entries, groupBy, groupOrder } = get();
        set({ sortKey: key, sortDirection: "asc", entries: organizeEntries(entries, key, "asc", groupBy, groupOrder) });
      },
      setSortDirection: (direction: SortDirection) => {
        const { entries, sortKey, groupBy, groupOrder } = get();
        set({ sortDirection: direction, entries: organizeEntries(entries, sortKey, direction, groupBy, groupOrder) });
      },
      toggleSortDirection: () => get().setSortDirection(get().sortDirection === "asc" ? "desc" : "asc"),
      setGroupBy: (groupBy: GroupBy) => {
        const { entries, sortKey, sortDirection, groupOrder } = get();
        set({ groupBy, entries: organizeEntries(entries, sortKey, sortDirection, groupBy, groupOrder) });
      },
      setGroupOrder: (direction: SortDirection) => {
        const { entries, sortKey, sortDirection, groupBy } = get();
        set({ groupOrder: direction, entries: organizeEntries(entries, sortKey, sortDirection, groupBy, direction) });
      },
      setViewMode: (mode: ViewMode) => set({ viewMode: mode }),

      toggleFavorite: (path: string) => {
        const { favorites } = get();
        set({
          favorites: favorites.includes(path)
            ? favorites.filter((f) => f !== path)
            : [...favorites, path],
        });
      },

      openContextMenu: (x: number, y: number, background = false) => set({ contextMenu: { x, y, background } }),
      closeContextMenu: () => set({ contextMenu: null }),

      openPrompt: (kind: PromptKind, target?: Entry) => set({ activePrompt: kind, promptTarget: target ?? null }),
      closePrompt: () => set({ activePrompt: null, promptTarget: null }),

      setClipboard: (paths: string[], op: ClipboardOp) => set({ clipboard: { paths, op } }),
      clearClipboard: () => set({ clipboard: null }),

      openDeleteConfirm: (target?: Entry[]) => set({ deleteConfirmOpen: true, deleteTarget: target ?? null }),
      closeDeleteConfirm: () => set({ deleteConfirmOpen: false, deleteTarget: null }),

      selectOnly: (path: string) => set({ selectedPaths: [path], selectionAnchor: path }),

      toggleSelect: (path: string) => {
        const { selectedPaths } = get();
        set({
          selectedPaths: selectedPaths.includes(path)
            ? selectedPaths.filter((p) => p !== path)
            : [...selectedPaths, path],
          selectionAnchor: path,
        });
      },

      selectRange: (path: string) => {
        const { entries, selectionAnchor } = get();
        const paths = entries.map((e) => e.path);
        const anchorIdx = selectionAnchor ? paths.indexOf(selectionAnchor) : -1;
        const targetIdx = paths.indexOf(path);
        if (anchorIdx === -1 || targetIdx === -1) {
          set({ selectedPaths: [path], selectionAnchor: path });
          return;
        }
        const [start, end] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        set({ selectedPaths: paths.slice(start, end + 1) });
      },

      ensureSelected: (path: string) => {
        if (!get().selectedPaths.includes(path)) {
          set({ selectedPaths: [path], selectionAnchor: path });
        }
      },

      clearSelection: () => set({ selectedPaths: [], selectionAnchor: null }),
      clearError: () => set({ error: null }),
    }),
    {
      name: "schlag.file-explorer",
      partialize: (state) => ({
        favorites: state.favorites,
        sidebarWidth: state.sidebarWidth,
        previewOpen: state.previewOpen,
        previewWidth: state.previewWidth,
        sortKey: state.sortKey,
        sortDirection: state.sortDirection,
        groupBy: state.groupBy,
        groupOrder: state.groupOrder,
        viewMode: state.viewMode,
      }),
    },
  ),
);
