import { basename } from "./path";
import { stripZipMarkerSuffix } from "./zipPath";
import { THIS_PC, type Entry } from "../file-explorer.types";

// The per-tab slice of navigation/selection state — everything that used to
// be a single top-level field on the store before Tabs existed. Deliberately
// does NOT include sortKey/sortDirection/groupBy/groupOrder/viewMode/
// favorites/clipboard/etc. — those stay global preferences, same "v1 scope
// limit" already applied to sort/view being global-not-per-folder.
export interface Tab {
  id: string;
  currentPath: string;
  addressInput: string;
  entries: Entry[];
  history: string[];
  historyIndex: number;
  selectedPaths: string[];
  selectionAnchor: string | null;
}

export function createTab(path: string): Tab {
  return {
    id: crypto.randomUUID(),
    currentPath: path,
    addressInput: path === THIS_PC ? "This PC" : path,
    entries: [],
    // Empty history, NOT [path] — newTab()/init() immediately call
    // navigate(path), which is the single place that seeds history. Seeding
    // [path] here too would make navigate append a duplicate ([path, path],
    // index 1), leaving a brand-new tab with the Back button wrongly enabled
    // and "back" going to the same path. currentPath/addressInput are still
    // set so the tab renders its label correctly before that navigate lands.
    history: [],
    historyIndex: -1,
    selectedPaths: [],
    selectionAnchor: null,
  };
}

// Which tab should become active after closing `closingId`. Closing a
// background tab never changes who's active. Closing the active tab prefers
// the tab to its right (matches browser/editor convention), falling back to
// the tab to its left; returns null only when `closingId` is the last tab
// left — the caller must refuse to close it, not just leave activeTabId
// dangling.
export function nextActiveTabId(tabs: Tab[], activeId: string, closingId: string): string | null {
  if (closingId !== activeId) return activeId;
  if (tabs.length <= 1) return null;
  const idx = tabs.findIndex((t) => t.id === closingId);
  if (idx === -1) return null;
  return (tabs[idx + 1] ?? tabs[idx - 1])?.id ?? null;
}

// Moves `draggedId` to sit just before (or, if `insertAfter`, just after)
// `targetId` — the rest shift to make room. `insertAfter` matters: without
// it, a tab could only ever be inserted *before* some other tab, which
// makes it impossible to ever move a tab to the very end (there's no tab
// "after the last one" to drop before) — the caller decides this from which
// half of the target the cursor is over, same convention most drag-reorder
// UIs use. Re-finding the target's index *after* removing the dragged tab
// (rather than computing a before/after offset up front) already gives the
// right slot regardless of whether the drag moved left or right. No-ops
// (returns the same array) if either id is missing or they're the same tab.
export function reorderTabs(tabs: Tab[], draggedId: string, targetId: string, insertAfter: boolean): Tab[] {
  if (draggedId === targetId) return tabs;
  const draggedIndex = tabs.findIndex((t) => t.id === draggedId);
  if (draggedIndex === -1 || !tabs.some((t) => t.id === targetId)) return tabs;
  const next = [...tabs];
  const [dragged] = next.splice(draggedIndex, 1);
  const targetIndex = next.findIndex((t) => t.id === targetId);
  next.splice(insertAfter ? targetIndex + 1 : targetIndex, 0, dragged);
  return next;
}

// "This PC" for the sentinel path, otherwise the folder/file name — mirrors
// AddressBar's own isThisPC special-case rather than showing the sentinel
// string. `|| currentPath` guards a theoretical empty basename (never
// actually happens — basename("C:\\") already returns "C:", not "" — but
// costs nothing to be defensive here).
export function tabLabel(currentPath: string): string {
  if (currentPath === THIS_PC) return "This PC";
  return stripZipMarkerSuffix(basename(currentPath) || currentPath);
}
