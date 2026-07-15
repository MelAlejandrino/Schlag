import { create } from "zustand/react";
import { persist } from "zustand/middleware";
import { fileExplorerService } from "../services/file-explorer.service";
import { useSettingsStore } from "./settings.store";
import { dirname } from "../lib/path";
import type { PromptKind } from "../lib/promptConfig";
import { sortEntries, type SortDirection, type SortKey } from "../lib/sortEntries";
import { compareGroupKeys, groupKeyFor, type GroupBy } from "../lib/groupEntries";
import { createTab, nextActiveTabId, reorderTabs, type Tab } from "../lib/tabs";
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
  // Hoisted fields of whichever tab is active. Every existing consumer
  // (Toolbar, AddressBar, EntryTable, useSearch.ts's direct store selectors,
  // canGoBack/canGoForward in useFileExplorer.ts, etc.) keeps reading these
  // exactly as before — they still mean "the current tab's X," now backed
  // by `tabs`/`activeTabId` underneath instead of being the only copy. Kept
  // in sync with the matching `tabs[]` entry by applyTabPatch, below.
  currentPath: string;
  addressInput: string;
  entries: Entry[];
  history: string[];
  historyIndex: number;
  selectedPaths: string[];
  selectionAnchor: string | null;

  tabs: Tab[];
  activeTabId: string;

  quickAccess: QuickAccessDir[];
  drives: QuickAccessDir[];
  favorites: string[];
  // Persisted the same way favorites is — a lasting per-user preference, not
  // per-session state. Default matches DESIGN.md's sidebar-width token.
  sidebarWidth: number;
  // A single global preference, not per-folder memory like real Explorer —
  // a stated v1 scope limit, not an oversight. Persisted the same
  // lasting-preference way as sidebarWidth. Stays global across
  // tabs too, same reasoning — see setSortKey etc. below for how a change
  // still reaches every open tab's already-loaded entries, not just the
  // active one.
  sortKey: SortKey;
  sortDirection: SortDirection;
  groupBy: GroupBy;
  // Separate from sortDirection — which group appears first (e.g. "Today"
  // vs "Earlier") is a different question from which order entries appear
  // in within a group; conflating them was reported as surprising.
  groupOrder: SortDirection;
  viewMode: ViewMode;
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
  // A one-shot "scroll this path into view once the listing renders" signal,
  // set by openFileLocation (a search result's folder can have thousands of
  // entries, and selecting the target isn't enough — it's off-screen). The
  // listing (EntryTable/EntryGrid) consumes it and immediately clears it via
  // setRevealPath(null), so it fires exactly once and never re-scrolls on an
  // unrelated re-render. Transient, not part of Tab — only ever meaningful
  // for the active tab right after its own navigation.
  revealPath: string | null;
  focusAddressBar: number;
  initialized: boolean;
  viewState: "browse" | "settings";
  // The bottom-docked terminal panel (TerminalPanel.tsx) — terminalCwd is
  // where the next spawned shell should start; opening it while it's already
  // open at a different folder respawns a fresh shell there (no "cd" typed
  // in for you, no tracking of a live session across navigations).
  terminalOpen: boolean;
  terminalCwd: string;
  // Persisted the same lasting-preference way as sidebarWidth.
  terminalHeight: number;

  init: () => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;
  navigate: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshTabsShowing: (paths: string[]) => Promise<void>;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  newTab: (path?: string) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  nextTab: () => void;
  prevTab: () => void;
  reorderTabs: (draggedId: string, targetId: string, insertAfter: boolean) => void;
  setRevealPath: (path: string | null) => void;
  requestFocusAddress: () => void;
  setAddressInput: (value: string) => void;
  setSidebarWidth: (width: number) => void;
  openTerminal: (path: string) => void;
  closeTerminal: () => void;
  setTerminalHeight: (height: number) => void;
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
    (set, get) => {
      // Writes a Tab-shaped patch into tabs[]'s entry for `tabId`, always —
      // and additionally mirrors it into the top-level fields, but ONLY if
      // `tabId` is still the active tab by the time this runs. The guard
      // matters because navigate/refresh/goBack/goForward all have an async
      // gap between starting a load and applying its result — without it,
      // switching tabs mid-flight would let a slow background-tab load
      // clobber whatever tab the user is actually looking at once it
      // resolves.
      function applyTabPatch(tabId: string, patch: Partial<Tab>) {
        const { tabs, activeTabId } = get();
        const nextTabs = tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t));
        set(tabId === activeTabId ? { ...patch, tabs: nextTabs } : { tabs: nextTabs });
      }

      function getTab(tabId: string): Tab | undefined {
        return get().tabs.find((t) => t.id === tabId);
      }

      // sortKey/sortDirection/groupBy/groupOrder are global, but re-sorting
      // only the active tab's `entries` would leave every background tab
      // showing stale order until its next navigate/refresh — a real,
      // visible inconsistency the moment you switch to it. Re-organizing
      // every tab's already-loaded entries here (cheap: an in-memory array
      // sort, no I/O, regardless of how many tabs are open) keeps all of
      // them consistent with the new preference immediately.
      function reorganizeAllTabs(sortKey: SortKey, sortDirection: SortDirection, groupBy: GroupBy, groupOrder: SortDirection) {
        const { tabs, activeTabId } = get();
        const nextTabs = tabs.map((t) => ({ ...t, entries: organizeEntries(t.entries, sortKey, sortDirection, groupBy, groupOrder) }));
        set({ tabs: nextTabs, entries: nextTabs.find((t) => t.id === activeTabId)?.entries ?? [] });
      }

      return {
        currentPath: "",
        addressInput: "",
        entries: [],
        tabs: [],
        activeTabId: "",
        quickAccess: [],
        drives: [],
        favorites: [],
        sidebarWidth: 240,
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
        revealPath: null,
        focusAddressBar: 0,
        terminalOpen: false,
        terminalCwd: "",
        terminalHeight: 260,
        selectedPaths: [],
        selectionAnchor: null,
        initialized: false,
        viewState: "browse",

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

            // Resolve startup path from settings.
            const settings = useSettingsStore.getState();
            let startupPath = THIS_PC;
            if (settings.startupBehavior === "last-folder") {
              const lastPath = get().currentPath;
              if (lastPath && lastPath !== THIS_PC) startupPath = lastPath;
            } else if (settings.startupBehavior === "custom" && settings.startupPath) {
              startupPath = settings.startupPath;
            }

            const firstTab = createTab(startupPath);
            set({
              quickAccess,
              drives,
              tabs: [firstTab],
              activeTabId: firstTab.id,
              currentPath: firstTab.currentPath,
              addressInput: firstTab.addressInput,
              entries: firstTab.entries,
              history: firstTab.history,
              historyIndex: firstTab.historyIndex,
              selectedPaths: firstTab.selectedPaths,
              selectionAnchor: firstTab.selectionAnchor,
              // Settings > General's "Default View" is documented (SettingsPage.tsx)
              // as "applied on next app launch" — this is that application point.
              // Overrides whatever sortKey/groupBy/viewMode this store's own
              // persist rehydrated from the previous session.
              sortKey: settings.defaultSortKey,
              sortDirection: settings.defaultSortDirection,
              groupBy: settings.defaultGroupBy,
              viewMode: settings.defaultViewMode,
            });
            await get().navigate(startupPath);
          } catch (e) {
            set({ error: String(e) });
          }
        },

        navigate: async (path: string) => {
          const tabId = get().activeTabId;
          try {
            const raw = await loadEntries(path);
            const tab = getTab(tabId);
            if (!tab) return; // the tab was closed while this load was in flight
            const { sortKey, sortDirection, groupBy, groupOrder } = get();
            const entries = organizeEntries(raw, sortKey, sortDirection, groupBy, groupOrder);
            const nextHistory = [...tab.history.slice(0, tab.historyIndex + 1), path];
            applyTabPatch(tabId, {
              entries,
              currentPath: path,
              addressInput: path === THIS_PC ? "This PC" : path,
              history: nextHistory,
              historyIndex: nextHistory.length - 1,
              selectedPaths: [],
              selectionAnchor: null,
            });
            // Guarded on the tab still being active for the same reason
            // applyTabPatch is: if the user switched tabs during the await,
            // this navigate is now for a background tab and must not clobber
            // the *current* tab's global error banner / reveal signal.
            // Clears any leftover reveal from an unrelated navigation —
            // openFileLocation sets revealPath *after* awaiting this (and
            // never switches tabs), so its own reveal always survives; only
            // stale ones from plain navigations (double-clicking a folder,
            // breadcrumbs) get cleared here.
            if (get().activeTabId === tabId) set({ error: null, revealPath: null });
          } catch (e) {
            set({ error: String(e) });
          }
        },

        refresh: async () => {
          const tabId = get().activeTabId;
          const tab = getTab(tabId);
          if (!tab || tab.currentPath === THIS_PC) return;
          try {
            const raw = await loadEntries(tab.currentPath);
            const { sortKey, sortDirection, groupBy, groupOrder } = get();
            applyTabPatch(tabId, { entries: organizeEntries(raw, sortKey, sortDirection, groupBy, groupOrder) });
            set({ error: null });
          } catch (e) {
            set({ error: String(e) });
          }
        },

        // Re-fetches every tab (active or not) whose currentPath is one of
        // `paths` — used after a file operation (move/copy/delete/rename)
        // instead of refresh()'s "just the active tab," since with multiple
        // tabs open a move/paste/delete/rename can affect a folder that's
        // sitting open in a *different*, currently-background tab (drag a
        // file onto another tab, or rename/delete a search result that
        // lives somewhere other tabs happen to be browsing). Without this,
        // that other tab keeps showing stale contents until the user
        // happens to click Refresh themselves. Runs all affected tabs'
        // reloads concurrently — each is an independent fetch, not a chain.
        refreshTabsShowing: async (paths: string[]) => {
          const targets = get().tabs.filter((t) => paths.includes(t.currentPath));
          await Promise.all(
            targets.map(async (tab) => {
              try {
                const raw = await loadEntries(tab.currentPath);
                const { sortKey, sortDirection, groupBy, groupOrder } = get();
                applyTabPatch(tab.id, { entries: organizeEntries(raw, sortKey, sortDirection, groupBy, groupOrder) });
              } catch (e) {
                if (tab.id === get().activeTabId) set({ error: String(e) });
              }
            }),
          );
        },

        goBack: () => {
          const tabId = get().activeTabId;
          const tab = getTab(tabId);
          if (!tab || tab.historyIndex <= 0) return;
          const idx = tab.historyIndex - 1;
          const path = tab.history[idx];
          applyTabPatch(tabId, { historyIndex: idx, selectedPaths: [], selectionAnchor: null });
          loadEntries(path)
            .then((raw) => {
              const { sortKey, sortDirection, groupBy, groupOrder } = get();
              applyTabPatch(tabId, {
                entries: organizeEntries(raw, sortKey, sortDirection, groupBy, groupOrder),
                currentPath: path,
                addressInput: path === THIS_PC ? "This PC" : path,
              });
            })
            .catch((e) => set({ error: String(e) }));
        },

        goForward: () => {
          const tabId = get().activeTabId;
          const tab = getTab(tabId);
          if (!tab || tab.historyIndex >= tab.history.length - 1) return;
          const idx = tab.historyIndex + 1;
          const path = tab.history[idx];
          applyTabPatch(tabId, { historyIndex: idx, selectedPaths: [], selectionAnchor: null });
          loadEntries(path)
            .then((raw) => {
              const { sortKey, sortDirection, groupBy, groupOrder } = get();
              applyTabPatch(tabId, {
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

        // New tabs always start at This PC, matching how the app itself
        // starts — not a duplicate of the current tab's path (that's a
        // separate, explicit "open in new tab" action on a specific entry,
        // see useFileExplorer.ts's openInNewTab). Reuses navigate()'s own
        // loading/error handling rather than duplicating it — by the time
        // navigate() reads `activeTabId`/`tabs`, the new tab is already the
        // active one, so its result lands in the right place for free.
        newTab: (path: string = THIS_PC) => {
          const tab = createTab(path);
          const { tabs } = get();
          set({
            tabs: [...tabs, tab],
            activeTabId: tab.id,
            currentPath: tab.currentPath,
            addressInput: tab.addressInput,
            entries: tab.entries,
            history: tab.history,
            historyIndex: tab.historyIndex,
            selectedPaths: tab.selectedPaths,
            selectionAnchor: tab.selectionAnchor,
          });
          get().navigate(path);
        },

        closeTab: (id: string) => {
          const { tabs, activeTabId } = get();
          const nextId = nextActiveTabId(tabs, activeTabId, id);
          if (nextId === null) return; // the only tab left — refuse to close it
          const remaining = tabs.filter((t) => t.id !== id);
          if (nextId === activeTabId) {
            // Closed a background tab — the active tab's own fields are
            // untouched, just drop the closed one from the list.
            set({ tabs: remaining });
            return;
          }
          const next = remaining.find((t) => t.id === nextId)!;
          set({
            tabs: remaining,
            activeTabId: next.id,
            currentPath: next.currentPath,
            addressInput: next.addressInput,
            entries: next.entries,
            history: next.history,
            historyIndex: next.historyIndex,
            selectedPaths: next.selectedPaths,
            selectionAnchor: next.selectionAnchor,
          });
        },

        switchTab: (id: string) => {
          const { activeTabId, tabs } = get();
          if (id === activeTabId) return;
          const next = tabs.find((t) => t.id === id);
          if (!next) return;
          set({
            activeTabId: next.id,
            currentPath: next.currentPath,
            addressInput: next.addressInput,
            entries: next.entries,
            history: next.history,
            historyIndex: next.historyIndex,
            selectedPaths: next.selectedPaths,
            selectionAnchor: next.selectionAnchor,
          });
        },

        nextTab: () => {
          const { tabs, activeTabId } = get();
          if (tabs.length <= 1) return;
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          const next = tabs[(idx + 1) % tabs.length];
          get().switchTab(next.id);
        },

        prevTab: () => {
          const { tabs, activeTabId } = get();
          if (tabs.length <= 1) return;
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
          get().switchTab(prev.id);
        },

        // Doesn't touch which tab is active or its data — just the array's
        // own order — so there's no top-level-field mirroring to do here,
        // unlike switchTab/closeTab.
        reorderTabs: (draggedId: string, targetId: string, insertAfter: boolean) => {
          set({ tabs: reorderTabs(get().tabs, draggedId, targetId, insertAfter) });
        },

        setRevealPath: (path: string | null) => set({ revealPath: path }),
        requestFocusAddress: () => set({ focusAddressBar: get().focusAddressBar + 1 }),
        openSettings: () => set({ viewState: "settings" }),
        closeSettings: () => set({ viewState: "browse" }),
        setAddressInput: (value: string) => applyTabPatch(get().activeTabId, { addressInput: value }),
        setSidebarWidth: (width: number) => set({ sidebarWidth: width }),
        openTerminal: (path: string) => set({ terminalOpen: true, terminalCwd: path }),
        closeTerminal: () => set({ terminalOpen: false }),
        setTerminalHeight: (height: number) => set({ terminalHeight: height }),

        // Always resets to ascending — matches Explorer's own convention of a
        // fresh column always starting ascending, rather than carrying over
        // whatever direction the previous column happened to be in.
        setSortKey: (key: SortKey) => {
          const { groupBy, groupOrder } = get();
          set({ sortKey: key, sortDirection: "asc" });
          reorganizeAllTabs(key, "asc", groupBy, groupOrder);
        },
        setSortDirection: (direction: SortDirection) => {
          const { sortKey, groupBy, groupOrder } = get();
          set({ sortDirection: direction });
          reorganizeAllTabs(sortKey, direction, groupBy, groupOrder);
        },
        toggleSortDirection: () => get().setSortDirection(get().sortDirection === "asc" ? "desc" : "asc"),
        setGroupBy: (groupBy: GroupBy) => {
          const { sortKey, sortDirection, groupOrder } = get();
          set({ groupBy });
          reorganizeAllTabs(sortKey, sortDirection, groupBy, groupOrder);
        },
        setGroupOrder: (direction: SortDirection) => {
          const { sortKey, sortDirection, groupBy } = get();
          set({ groupOrder: direction });
          reorganizeAllTabs(sortKey, sortDirection, groupBy, direction);
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

        selectOnly: (path: string) => applyTabPatch(get().activeTabId, { selectedPaths: [path], selectionAnchor: path }),

        toggleSelect: (path: string) => {
          const { selectedPaths } = get();
          applyTabPatch(get().activeTabId, {
            selectedPaths: selectedPaths.includes(path)
              ? selectedPaths.filter((p) => p !== path)
              : [...selectedPaths, path],
            selectionAnchor: path,
          });
        },

        selectRange: (path: string) => {
          const { entries, selectionAnchor, activeTabId } = get();
          const paths = entries.map((e) => e.path);
          const anchorIdx = selectionAnchor ? paths.indexOf(selectionAnchor) : -1;
          const targetIdx = paths.indexOf(path);
          if (anchorIdx === -1 || targetIdx === -1) {
            applyTabPatch(activeTabId, { selectedPaths: [path], selectionAnchor: path });
            return;
          }
          const [start, end] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
          applyTabPatch(activeTabId, { selectedPaths: paths.slice(start, end + 1) });
        },

        ensureSelected: (path: string) => {
          if (!get().selectedPaths.includes(path)) {
            applyTabPatch(get().activeTabId, { selectedPaths: [path], selectionAnchor: path });
          }
        },

        clearSelection: () => applyTabPatch(get().activeTabId, { selectedPaths: [], selectionAnchor: null }),
        clearError: () => set({ error: null }),
      };
    },
    {
      name: "schlag.file-explorer",
      partialize: (state) => ({
        favorites: state.favorites,
        sidebarWidth: state.sidebarWidth,
        terminalHeight: state.terminalHeight,
        groupOrder: state.groupOrder,
        currentPath: state.currentPath,
      }),
    },
  ),
);
