import { useCallback, useEffect } from "react";
import { fileExplorerService } from "./services/file-explorer.service";
import { useFileExplorerStore } from "./store/file-explorer.store";
import { basename, dirname, joinPath } from "./lib/path";
import { getPromptConfig } from "./lib/promptConfig";
import { filterEntries } from "./lib/filterEntries";
import type { SortKey } from "./lib/sortEntries";
import { isInsideZip, zipRootPath, zipSplit } from "./lib/zipPath";
import { THIS_PC, type Entry } from "./file-explorer.types";

interface SelectModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function useFileExplorer() {
  const store = useFileExplorerStore();
  // Search+ (index search) results, when active, ARE the listing — so the
  // whole selection/DnD/context-menu/sort/group machinery below operates on
  // them exactly as it does on a real folder (store.searchResults is already
  // organized by the current sort/group). Falls back to the folder's own
  // entries when no search is showing.
  const listingEntries = store.searchResults ?? store.entries;
  const selectedEntries = listingEntries.filter((e) => store.selectedPaths.includes(e.path));
  // The rows the listing actually renders. For a folder, the "filter this
  // folder" query is applied client-side (a selected row hidden by the filter
  // stays selected but off-screen); search results are shown as-is.
  const visibleEntries = store.searchResults ?? filterEntries(store.entries, store.filterQuery);
  // Derived once per render, same as selectedEntries above, and reused by
  // every plain-function write-action guard below — a zip is read-only
  // browsing (plan.md's Phase 7 sketch). The useCallback handlers further
  // down (openContextMenuForEntry, dropOnto, openTerminalContextMenu) each
  // check a *different* path (a fresh getState().currentPath, a drop target,
  // a selected folder) than this hook-render's own currentPath, so they
  // still call isInsideZip() directly rather than closing over this value.
  const insideZip = isInsideZip(store.currentPath);

  useEffect(() => {
    store.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable identity (useCallback + getState(), not the reactive `store`
  // variable) — this is one of the handlers EntryTable/EntryGrid pass all
  // the way down to EntryRow/EntryTile, which are React.memo'd specifically
  // so a selection change doesn't re-render every row. useFileExplorerStore()
  // (no selector, above) re-renders this whole hook on every store change,
  // so a plain function here would get a fresh identity every render and
  // silently defeat that memoization — confirmed while verifying the
  // Performance pass actually helps, not just looks like it does.
  const openEntry = useCallback((entry: Entry) => {
    if (entry.is_dir) {
      useFileExplorerStore.getState().navigate(entry.path);
      return;
    }
    // A file already inside a zip: extract it to a temp file, then reuse
    // the normal openFile flow on that real path — no separate "open from
    // memory" plumbing needed. A real .zip file's own row (not yet inside
    // one): browse into it in-app instead of handing off to the OS, same as
    // double-clicking a folder.
    const zip = zipSplit(entry.path);
    if (zip) {
      fileExplorerService
        .extractZipEntry(zip.archivePath, zip.innerPath)
        .then((tempPath) => fileExplorerService.openFile(tempPath))
        .catch((e) => useFileExplorerStore.setState({ error: String(e) }));
      return;
    }
    if (entry.name.toLowerCase().endsWith(".zip")) {
      useFileExplorerStore.getState().navigate(zipRootPath(entry.path));
      return;
    }
    fileExplorerService.openFile(entry.path).catch((e) => useFileExplorerStore.setState({ error: String(e) }));
  }, []);

  function openSelected() {
    if (selectedEntries.length === 1) openEntry(selectedEntries[0]);
  }

  // Clicking the already-active column flips direction; clicking a
  // different one switches to it ascending — same convention as every other
  // sortable-header UI (Explorer's own Details view included).
  function onSortColumnClick(key: SortKey) {
    if (key === store.sortKey) {
      store.toggleSortDirection();
    } else {
      store.setSortKey(key);
    }
  }

  // Single-entry variants (openEntryWith/showEntryProperties/openFileLocation/
  // renameEntry/copyEntryToClipboard/cutEntryToClipboard/deleteEntryPrompt)
  // exist alongside the "*Selected" ones above/below because a search
  // result's context menu (SearchModal.tsx) needs to act on one specific
  // entry that isn't part of the current directory listing at all — the
  // ambient `store.selectedPaths`/`selectedEntries` mechanism only ever
  // covers `store.entries`, so it can't represent "this file, found by
  // search, somewhere else entirely."
  function openEntryWith(entry: Entry) {
    fileExplorerService.openWithDialog(entry.path).catch((e) => useFileExplorerStore.setState({ error: String(e) }));
  }

  function openWithSelected() {
    if (selectedEntries.length !== 1) return;
    openEntryWith(selectedEntries[0]);
  }

  // Split out from showEntryProperties so the sidebar (whose items are
  // {name, path} pairs, not full Entry objects) can reuse it directly.
  function showPropertiesForPath(path: string) {
    fileExplorerService.showProperties(path).catch((e) => useFileExplorerStore.setState({ error: String(e) }));
  }

  function showEntryProperties(entry: Entry) {
    showPropertiesForPath(entry.path);
  }

  function showPropertiesSelected() {
    if (selectedEntries.length !== 1) return;
    showEntryProperties(selectedEntries[0]);
  }

  // "Open file location" — navigates to the entry's parent folder and
  // selects it there, rather than opening the entry itself. Most useful for
  // a search result, which can live anywhere; less useful (but harmless)
  // when browsing normally, where it just re-confirms the folder you're
  // already in — which is also why the normal EntryTable context menu
  // doesn't surface this action (ContextMenu's onOpenLocation prop is
  // optional and SearchModal is the only caller that passes it).
  async function openFileLocation(entry: Entry) {
    const parent = dirname(entry.path);
    await store.navigate(parent === "" ? THIS_PC : parent);
    store.selectOnly(entry.path);
    // Not enough to just select it — the folder can hold thousands of
    // entries and the target is often off-screen. revealPath tells the
    // listing to scroll it into view once it renders (see EntryTable/
    // EntryGrid), then clears itself so it fires exactly once.
    store.setRevealPath(entry.path);
  }

  function openLocationSelected() {
    if (selectedEntries.length !== 1) return;
    openFileLocation(selectedEntries[0]);
  }

  // Folders only — a file has nowhere to "open a tab to." Mirrors the
  // explicit-entry/selected-entry pair shape every other single-target
  // action here already uses (openEntryWith/openWithSelected, etc.).
  function openInNewTab(entry: Entry) {
    store.newTab(entry.path);
  }

  function openSelectedInNewTab() {
    if (selectedEntries.length !== 1 || !selectedEntries[0].is_dir) return;
    openInNewTab(selectedEntries[0]);
  }

  // Stable identity — see openEntry's comment above for why (this is
  // EntryTable/EntryGrid's onSelect, also passed straight to EntryRow/
  // EntryTile).
  const selectEntry = useCallback((entry: Entry, mods: SelectModifiers) => {
    const s = useFileExplorerStore.getState();
    if (mods.shiftKey) s.selectRange(entry.path);
    else if (mods.ctrlKey || mods.metaKey) s.toggleSelect(entry.path);
    else s.selectOnly(entry.path);
  }, []);

  // Stable identity — see openEntry's comment above (EntryTable/EntryGrid's
  // onContextMenu).
  const openContextMenuForEntry = useCallback((entry: Entry, x: number, y: number) => {
    const s = useFileExplorerStore.getState();
    if (isInsideZip(s.currentPath)) return;
    s.ensureSelected(entry.path);
    s.openContextMenu(x, y);
  }, []);

  // Stable identity — see openEntry's comment above (EntryTable/EntryGrid's
  // onDragPaths). Dragging a selected entry drags the whole selection;
  // dragging an unselected one drags just itself (and becomes the new
  // selection). Reads selectedPaths via getState() rather than the closure,
  // same reason as everywhere else in this block — a stale captured
  // selectedPaths would make this decide based on whatever was selected
  // when the component last mounted, not what's actually selected now.
  const getDragPaths = useCallback((entry: Entry): string[] => {
    const s = useFileExplorerStore.getState();
    if (s.selectedPaths.includes(entry.path) && s.selectedPaths.length > 1) {
      return s.selectedPaths;
    }
    s.selectOnly(entry.path);
    return [entry.path];
  }, []);

  // Stable identity — see openEntry's comment above (EntryTable/EntryGrid's
  // onDrop, passed straight to EntryRow/EntryTile). Reads via getState()
  // rather than the closed-over `store`, same reason as every other handler
  // in this block.
  const dropOnto = useCallback(async (sourcePaths: string[], targetPath: string, isCopy: boolean) => {
    // This PC has no real folder to move/copy into — guarded here rather
    // than at each call site, since TabBar's drag-to-switch-tabs can now
    // land a drop on a tab that's sitting at THIS_PC. A zip is read-only
    // browsing, same reason.
    if (targetPath === THIS_PC || isInsideZip(targetPath)) return;
    const op = isCopy ? fileExplorerService.copyEntry : fileExplorerService.moveEntry;
    // A row inside a zip is still draggable (no "is this row read-only"
    // concept at the drag layer) — filter its virtual path out here rather
    // than teaching every drop target about zips, same as the THIS_PC/
    // self-drop filters already on this line.
    const items = sourcePaths.filter((p) => p !== targetPath && dirname(p) !== targetPath && !isInsideZip(p));
    if (items.length === 0) return;
    const s = useFileExplorerStore.getState();
    try {
      await Promise.all(items.map((p) => op(p, joinPath(targetPath, basename(p)))));
      s.clearSelection();
      // refreshTabsShowing (not just refresh()) since dropping onto another
      // tab (TabBar's drag-to-switch) already made that tab active by the
      // time this runs — a plain refresh() only catches the destination;
      // the tab the file came *from* is now a background tab and needs
      // refreshing too, or it keeps showing the file until manually
      // refreshed. Skipped for a copy — the source is untouched.
      const affected = new Set(isCopy ? [targetPath] : [targetPath, ...items.map((p) => dirname(p))]);
      s.refreshTabsShowing([...affected]);
    } catch (e) {
      useFileExplorerStore.setState({ error: String(e) });
    }
  }, []);

  // A zip is read-only browsing — no write action applies inside one, same
  // "no clear use case, don't invent disabled-looking buttons" call this
  // project already made for Sidebar/This-PC right-click.
  function newFolder() {
    if (store.currentPath === THIS_PC || insideZip) return;
    store.openPrompt("new-folder");
  }

  function newFile() {
    if (store.currentPath === THIS_PC || insideZip) return;
    store.openPrompt("new-file");
  }

  // Explicit-target rename opens the same PromptModal, just recording which
  // entry it's for (store.promptTarget) instead of relying on the ambient
  // selection — see confirmPrompt/getPromptConfig's `promptEntries` below.
  function renameEntry(entry: Entry) {
    if (isInsideZip(entry.path)) return;
    store.openPrompt("rename", entry);
  }

  function renameSelected() {
    if (selectedEntries.length !== 1 || insideZip) return;
    store.openPrompt("rename");
  }

  // Copy no longer opens a "type a destination path" modal — non-technical
  // users don't think in paths. It puts the selection on an in-app clipboard
  // instead, mirroring the OS's own copy/paste mental model; pasting happens
  // via the background context menu in whichever folder the user browses to.
  function copyEntryToClipboard(entry: Entry) {
    if (isInsideZip(entry.path)) return;
    store.setClipboard([entry.path], "copy");
  }

  function copySelected() {
    if (selectedEntries.length === 0 || insideZip) return;
    store.setClipboard(
      selectedEntries.map((e) => e.path),
      "copy",
    );
  }

  // Move is a cut, not a "type a destination path" modal — same clipboard
  // mechanism as Copy, differentiated only by op and by clearing the
  // clipboard once the paste actually moves the source away.
  function cutEntryToClipboard(entry: Entry) {
    if (isInsideZip(entry.path)) return;
    store.setClipboard([entry.path], "cut");
  }

  function cutSelected() {
    if (selectedEntries.length === 0 || insideZip) return;
    store.setClipboard(
      selectedEntries.map((e) => e.path),
      "cut",
    );
  }

  // Toolbar button — always targets the folder actually being browsed,
  // ignoring whatever's selected (matches Explorer's own toolbar "Open in
  // Terminal", which never depends on selection). Toggles closed if the
  // panel is already open at this same folder, rather than always
  // respawning a fresh shell on repeat clicks.
  function openTerminalToolbar() {
    if (store.currentPath === THIS_PC || insideZip) return;
    if (store.terminalOpen && store.terminalCwd === store.currentPath) {
      store.closeTerminal();
    } else {
      store.openTerminal(store.currentPath);
    }
  }

  // Context menu — shared by both the background (folder-level) menu and a
  // single selected folder's own row menu. Background right-click clears
  // selection first (see openBackgroundContextMenu below), so selectedEntries
  // is empty there and this naturally falls back to the current folder.
  function openTerminalContextMenu() {
    const target =
      selectedEntries.length === 1 && selectedEntries[0].is_dir ? selectedEntries[0].path : store.currentPath;
    if (target !== THIS_PC && !isInsideZip(target)) store.openTerminal(target);
  }

  // No context menu at all while browsing a zip — matches plan.md's own
  // sketch for this feature: a zip is read-only, so every item this menu
  // would show (New/Paste/Rename/Delete/Cut/Copy) is a dead-looking action
  // with no clear use case, same call already made for Sidebar/This-PC.
  function openBackgroundContextMenu(x: number, y: number) {
    if (insideZip) return;
    store.clearSelection();
    store.openContextMenu(x, y, true);
  }

  function toggleCurrentFavorite() {
    store.toggleFavorite(store.currentPath);
  }

  async function pasteIntoCurrent() {
    const clip = store.clipboard;
    if (!clip || store.currentPath === THIS_PC || insideZip) return;

    // A cut pasted back into the folder it's already in isn't a move at all
    // — nothing to do. (A copy pasted into its own folder is still a real
    // operation: it makes a numbered duplicate, same as unique_destination()
    // already does for drag-and-drop copies.) The clipboard is left alone so
    // the cut can still be pasted somewhere else afterward.
    const paths = clip.op === "cut" ? clip.paths.filter((p) => dirname(p) !== store.currentPath) : clip.paths;
    if (paths.length === 0) return;

    const op = clip.op === "copy" ? fileExplorerService.copyEntry : fileExplorerService.moveEntry;
    try {
      await Promise.all(paths.map((p) => op(p, joinPath(store.currentPath, basename(p)))));
      if (clip.op === "cut") store.clearClipboard();
      // A cut can be copied in one tab, then pasted after switching to
      // another — refreshTabsShowing catches the (now background) source
      // tab too, not just this one. Skipped for a copy, same reasoning as
      // dropOnto: the source is untouched.
      const affected = clip.op === "copy" ? [store.currentPath] : [store.currentPath, ...paths.map((p) => dirname(p))];
      store.refreshTabsShowing([...new Set(affected)]);
    } catch (e) {
      useFileExplorerStore.setState({ error: String(e) });
    }
  }

  // Deliberately lets rejections propagate (no try/catch): PromptModal
  // catches them itself to show the error inline and keep the modal open,
  // rather than the usual pattern of routing failures to the global error
  // banner — that banner renders behind the modal's backdrop and would be
  // invisible while the modal is still open.
  async function confirmPrompt(value: string) {
    const kind = store.activePrompt;
    if (!kind) return;

    let affectedFolder: string;
    if (kind === "new-folder" || kind === "new-file") {
      affectedFolder = store.currentPath;
      const path = joinPath(affectedFolder, value);
      if (kind === "new-folder") await fileExplorerService.createDir(path);
      else await fileExplorerService.createFile(path);
    } else {
      const entry = store.promptTarget ?? selectedEntries[0];
      if (!entry) return;
      if (value === entry.name) {
        store.closePrompt();
        return;
      }
      // Renaming a search result targets whatever folder it actually lives
      // in, not necessarily the active tab's own currentPath.
      affectedFolder = dirname(entry.path);
      await fileExplorerService.renameEntry(entry.path, joinPath(affectedFolder, value));
    }

    store.closePrompt();
    store.refreshTabsShowing([affectedFolder]);
  }

  // `promptTarget` (set by renameEntry(), the search-result entry point)
  // stands in for the ambient selection when present — see the store's own
  // comment on why a search result can't just be added to selectedPaths.
  const promptEntries = store.promptTarget ? [store.promptTarget] : selectedEntries;
  const promptConfig = store.activePrompt ? getPromptConfig(store.activePrompt, { selectedEntries: promptEntries }) : null;

  function deleteEntryPrompt(entry: Entry) {
    if (isInsideZip(entry.path)) return;
    store.openDeleteConfirm([entry]);
  }

  function deleteSelected() {
    if (selectedEntries.length === 0 || insideZip) return;
    store.openDeleteConfirm();
  }

  // `deleteTarget` (set by deleteEntryPrompt(), the search-result entry
  // point) stands in for the ambient selection when present, same pattern
  // as `promptEntries` above.
  const deleteEntries = store.deleteTarget ?? selectedEntries;
  const deleteMessage =
    deleteEntries.length === 1
      ? `Move "${deleteEntries[0].name}" to the Recycle Bin?`
      : `Move ${deleteEntries.length} items to the Recycle Bin?`;

  async function confirmDelete() {
    try {
      await Promise.all(deleteEntries.map((e) => fileExplorerService.deleteEntry(e.path)));
      store.clearSelection();
      // Deleting a search result targets whatever folder it actually lives
      // in — refreshTabsShowing catches any other tab open on that folder,
      // not just the active one.
      store.refreshTabsShowing([...new Set(deleteEntries.map((e) => dirname(e.path)))]);
    } catch (e) {
      useFileExplorerStore.setState({ error: String(e) });
    } finally {
      store.closeDeleteConfirm();
    }
  }

  return {
    ...store,
    canGoBack: store.historyIndex > 0,
    canGoForward: store.historyIndex < store.history.length - 1,
    isThisPC: store.currentPath === THIS_PC,
    isSettings: store.viewState === "settings",
    isCurrentFavorite: store.favorites.includes(store.currentPath),
    // A zip is read-only browsing (plan.md's Phase 7 sketch) — Toolbar/
    // ContextMenu use this to hide/disable write actions the same way they
    // already do for isThisPC.
    insideZip,
    // Search+ results are showing in the listing (vs the current folder) —
    // FileExplorerView uses this to render the listing over This PC and to
    // surface "Open file location" in the shared context menu.
    hasSearchResults: store.searchResults !== null,
    selectedEntries,
    visibleEntries,
    selectedIsDir: selectedEntries.length === 1 && selectedEntries[0].is_dir,
    canPaste: store.clipboard !== null && store.currentPath !== THIS_PC && !insideZip,
    // Clipboard presence is independent of whether Paste applies *here* — the
    // clear-clipboard affordance stays available even on This PC / inside a zip.
    hasClipboard: store.clipboard !== null,
    clearClipboard: store.clearClipboard,
    cutPaths: store.clipboard?.op === "cut" ? store.clipboard.paths : [],
    onSortColumnClick,
    deleteMessage,
    openEntry,
    openSelected,
    openWithSelected,
    showPropertiesSelected,
    openLocationSelected,
    openSelectedInNewTab,
    selectEntry,
    openContextMenuForEntry,
    openBackgroundContextMenu,
    pasteIntoCurrent,
    toggleCurrentFavorite,
    openTerminalToolbar,
    openTerminalContextMenu,
    getDragPaths,
    dropOnto,
    newFolder,
    newFile,
    promptConfig,
    confirmPrompt,
    renameSelected,
    deleteSelected,
    confirmDelete,
    copySelected,
    cutSelected,
    // Explicit-target variants for callers outside the current directory
    // listing (SearchModal's context menu) — see the comment above
    // openEntryWith for why these can't just reuse the "*Selected" ones.
    openEntryWith,
    showEntryProperties,
    showPropertiesForPath,
    openFileLocation,
    openInNewTab,
    renameEntry,
    copyEntryToClipboard,
    cutEntryToClipboard,
    deleteEntryPrompt,
  };
}
