import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ChevronDown, Loader2, MoreHorizontal } from "lucide-react";
import { useSearch, useSearchTrigger } from "../useSearch";
import { useFileExplorer } from "../useFileExplorer";
import { useFileExplorerStore } from "../store/file-explorer.store";
import { useSearchStore } from "../store/search.store";
import { THIS_PC } from "../file-explorer.types";
import { filterEntries } from "../lib/filterEntries";
import { folderSuggestions } from "../lib/folderSuggestions";
import { countActiveFilters, SearchFiltersFields } from "./SearchFiltersFields";
import { SearchResultRow, type SearchResult } from "./SearchResultRow";
import { ContextMenu } from "./ContextMenu";
import { useExclusiveMenu } from "../lib/useExclusiveMenu";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container";

// Both states spelled out as text, not an icon+tooltip — these are
// app-specific binary states with no self-evident glyph.
function SegmentedToggle({
  leftLabel,
  rightLabel,
  active,
  onChange,
  disabled,
  title,
}: {
  leftLabel: string;
  rightLabel: string;
  active: boolean;
  onChange: (active: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  const seg = (on: boolean) =>
    `px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-default disabled:opacity-40 ${focusRing} ${
      on ? "bg-primary-container/20 text-primary" : "text-outline hover:bg-surface-container-highest hover:text-on-surface"
    }`;
  return (
    <div title={title} className={`flex items-center overflow-hidden rounded border border-surface-container-highest ${disabled ? "opacity-40" : ""}`}>
      <button type="button" disabled={disabled} className={seg(!active)} onClick={() => onChange(false)}>
        {leftLabel}
      </button>
      <div className="h-4 w-px shrink-0 bg-surface-container-highest" />
      <button type="button" disabled={disabled} className={seg(active)} onClick={() => onChange(true)}>
        {rightLabel}
      </button>
    </div>
  );
}

interface ResultMenuState {
  x: number;
  y: number;
  item: SearchResult;
}

// A floating control anchored at the bottom-center of the listing. Two levels:
//
//  • Local (default): a round ellipsis morphs open into a rounded input that
//    narrows the *current folder's* already-loaded entries client-side
//    (filterEntries) — instant, no backend.
//  • Search+ : clicking the "Search+" button turns the border to the accent
//    colour and reveals the full index search (name/content, keyword, scope,
//    filters) with a results panel above — the app's main search, backed by
//    the shared search store. Ctrl+F opens straight into this level.
//
// One always-mounted container whose width/border transition between the two,
// so the upgrade reads as the bar growing rather than a new surface appearing.
export function FilterBar() {
  const search = useSearch();
  useSearchTrigger();
  const explorer = useFileExplorer();
  const entries = useFileExplorerStore((s) => s.entries);
  const filterQuery = useFileExplorerStore((s) => s.filterQuery);
  const setFilterQuery = useFileExplorerStore((s) => s.setFilterQuery);
  const currentPath = useFileExplorerStore((s) => s.currentPath);
  const activeTabId = useFileExplorerStore((s) => s.activeTabId);
  const focusFilter = useFileExplorerStore((s) => s.focusFilter);
  const favorites = useFileExplorerStore((s) => s.favorites);
  const quickAccess = useFileExplorerStore((s) => s.quickAccess);

  const plus = search.isOpen; // "Search+" (index search) level
  const [localOpen, setLocalOpen] = useState(false);
  const localActive = filterQuery.trim().length > 0;
  const expanded = plus || localOpen || localActive;

  const isThisPC = currentPath === THIS_PC;
  const scopedToFolder = search.scopeToFolder && !isThisPC;
  const [showFilters, setShowFilters] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [resultMenu, setResultMenu] = useState<ResultMenuState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  const [filtersPos, setFiltersPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const activeFilterCount = countActiveFilters(search.filters);
  const folderPathSuggestions = folderSuggestions(favorites, quickAccess);
  const activeResults: SearchResult[] = search.mode === "content" ? search.orderedContentResults : search.orderedResults;

  // Position the floating filters panel above the Filters button, clamped
  // to the viewport so it never goes off-screen on small windows.
  const positionFilters = useCallback(() => {
    const btn = filtersButtonRef.current;
    const panel = filtersPanelRef.current;
    if (!btn || !panel) return;
    const btnRect = btn.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const top = Math.max(8, btnRect.top - panelRect.height - 6);
    const left = Math.max(8, Math.min(btnRect.left, window.innerWidth - panelRect.width - 8));
    setFiltersPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (showFilters) positionFilters();
  }, [showFilters, positionFilters]);

  useLayoutEffect(() => {
    if (showFilters) positionFilters();
  }, [showFilters, positionFilters]);

  // Close floating filters on outside click or Escape.
  useEffect(() => {
    if (!showFilters) return;
    function onPointerDown(e: PointerEvent) {
      const panel = filtersPanelRef.current;
      const btn = filtersButtonRef.current;
      if (panel?.contains(e.target as Node) || btn?.contains(e.target as Node)) return;
      setShowFilters(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setShowFilters(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [showFilters]);

  const matchCount = filterEntries(entries, filterQuery).length;
  const total = entries.length;

  // Enter/leave the Search+ level, carrying the typed text across so switching
  // levels doesn't lose what you started typing.
  function enterPlus() {
    const q = useFileExplorerStore.getState().filterQuery;
    if (q) search.setQuery(q);
    setFilterQuery("");
    search.openSearch();
  }
  function exitPlus() {
    setFilterQuery("");
    search.clear();
    search.closeSearch();
    setShowFilters(false);
  }

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  // Ctrl+F (requestFocusFilter bumps this) → open the local filter and focus
  // it. On This PC there's no listing to filter, so open Search+ instead —
  // same fallback the ellipsis uses.
  useEffect(() => {
    if (!focusFilter) return;
    if (isThisPC) {
      enterPlus();
    } else {
      setLocalOpen(true);
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFilter]);

  // Escape closes the local filter even when the input isn't focused.
  useEffect(() => {
    if (!expanded || plus) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setFilterQuery("");
        setLocalOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, plus]);

  // Click outside the filter bar closes it — both local filter and Search+.
  useEffect(() => {
    if (!expanded) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      if (filtersPanelRef.current?.contains(e.target as Node)) return;
      if (plus) exitPlus();
      else {
        setFilterQuery("");
        setLocalOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, plus]);

  // Both levels are transient overlays tied to the current view: switching
  // folder *or* tab collapses the local filter and closes Search+, matching
  // how the old search behaved (it never stuck around across navigation).
  // Also dismisses when the terminal opens to avoid overlap.
  const terminalOpen = useFileExplorerStore((s) => s.terminalOpen);
  useEffect(() => {
    setFilterQuery("");
    setLocalOpen(false);
    setShowFilters(false);
    if (useSearchStore.getState().isOpen) search.closeSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, activeTabId, terminalOpen]);

  // Keyboard list navigation, only while Search+ is open. On a window listener
  // (not the input) so it still works after a click drops focus to <body>.
  const activeResultsRef = useRef(activeResults);
  activeResultsRef.current = activeResults;
  const highlightedRef = useRef(highlighted);
  highlightedRef.current = highlighted;
  const openResultRef = useRef(search.openResult);
  openResultRef.current = search.openResult;
  useEffect(() => {
    if (!plus) return;
    function onKey(e: globalThis.KeyboardEvent) {
      const results = activeResultsRef.current;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, Math.max(0, results.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = results[highlightedRef.current];
        if (item) openResultRef.current(item);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        exitPlus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plus]);

  // Reset highlight when the underlying results change (raw store arrays, not
  // the reordered view — that's a fresh array every render).
  useEffect(() => {
    setHighlighted(0);
  }, [search.results, search.contentResults, search.mode]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  useEffect(() => {
    if (!resultMenu) return;
    const close = () => setResultMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
  }, [resultMenu]);
  useExclusiveMenu(!!resultMenu, () => setResultMenu(null));

  function withMenuClosed(action: () => void) {
    action();
    setResultMenu(null);
  }
  function withSearchClosedToo(action: () => void) {
    action();
    exitPlus();
    setResultMenu(null);
  }

  const value = plus ? search.query : filterQuery;
  const placeholder = plus
    ? search.mode === "content"
      ? "Search file contents…"
      : "Search files and folders…"
    : "Filter items in this folder…";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div
        ref={containerRef}
        className={`pointer-events-auto relative flex flex-col overflow-hidden border bg-surface-container-high/95 shadow-lg backdrop-blur transition-[width,border-color] duration-300 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none max-w-[88vw] ${
          plus
            ? "w-[34rem] rounded-2xl border-primary"
            : expanded
              ? "w-96 rounded-full border-surface-container-highest"
              : "w-10 rounded-full border-surface-container-highest"
        }`}
      >
        {/* Search+ panel (results, filters, controls) grows upward above the
            input since the container's bottom edge is pinned (bottom-4). */}
        {plus && (
          <>
            <div id="floating-search-results" role="listbox" ref={listRef} className="themed-scroll max-h-[45vh] min-h-0 flex-1 overflow-y-auto">
              {!search.hasActiveQuery ? (
                <div className="px-4 py-10 text-center text-[12px] text-outline">Type a name, or switch to Contents</div>
              ) : activeResults.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] text-on-surface-variant">
                  {search.isSearching ? "Searching…" : `No matches for "${search.query}"`}
                </div>
              ) : (
                activeResults.map((item, index) => (
                  <SearchResultRow
                    key={item.path}
                    item={item}
                    index={index}
                    highlighted={index === highlighted}
                    onHover={() => setHighlighted(index)}
                    onOpen={() => search.openResult(item)}
                    onContextMenu={(x, y) => setResultMenu({ x, y, item })}
                  />
                ))
              )}
            </div>

            {search.error && (
              <div className="flex items-center gap-2 border-t border-error-container bg-error-container/20 px-4 py-2 text-[12px] text-on-error-container">
                <AlertCircle size={14} strokeWidth={1.75} className="shrink-0 text-error" />
                <span className="min-w-0 flex-1 truncate">{search.error}</span>
              </div>
            )}


            <div className="flex flex-wrap items-center gap-2 border-t border-surface-container-highest px-3.5 py-2">
              <SegmentedToggle
                leftLabel="Names"
                rightLabel="Contents"
                active={search.mode === "content"}
                onChange={(isContent) => {
                  if (isContent) setShowFilters(false);
                  search.setMode(isContent ? "content" : "filename");
                }}
              />
              <SegmentedToggle leftLabel="Exact" rightLabel="Keyword" active={search.keywordMode} onChange={search.setKeywordMode} />
              <SegmentedToggle
                leftLabel="Folder"
                rightLabel="Global"
                active={!scopedToFolder}
                disabled={isThisPC}
                title={isThisPC ? "No current folder to scope to on This PC" : undefined}
                onChange={(isGlobal) => search.setScopeToFolder(!isGlobal)}
              />
              <button
                ref={filtersButtonRef}
                type="button"
                title={search.mode === "content" ? "Filters only apply to name search" : undefined}
                disabled={search.mode === "content"}
                className={`flex items-center gap-1 rounded border border-surface-container-highest px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 hover:bg-surface-container-highest hover:text-on-surface disabled:cursor-default disabled:opacity-40 ${focusRing} ${
                  activeFilterCount > 0 ? "text-primary" : "text-outline"
                }`}
                onClick={() => setShowFilters((s) => !s)}
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary-container text-[9px] text-white">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown size={13} strokeWidth={1.75} className={`transition-transform duration-150 ${showFilters ? "rotate-180" : ""}`} />
              </button>
            </div>
          </>
        )}

        {/* Input row — always present; the bottom of the control both when
            collapsed (clipped to the circle) and expanded. */}
        <div className={`flex items-center gap-2 ${plus ? "border-t border-surface-container-highest px-3.5 py-2" : "px-3.5 py-2"} ${!expanded ? "invisible" : ""}`}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => (plus ? search.setQuery(e.target.value) : setFilterQuery(e.target.value))}
            onBlur={() => {
              if (!plus && !filterQuery.trim()) setLocalOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !plus) {
                e.stopPropagation();
                setFilterQuery("");
                setLocalOpen(false);
                inputRef.current?.blur();
              }
            }}
            placeholder={placeholder}
            aria-label={plus ? "Search" : "Filter items in this folder"}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-on-surface placeholder:text-outline focus:outline-none"
          />
          {plus && search.isSearching && <Loader2 size={14} strokeWidth={2} className="shrink-0 animate-spin text-outline" />}
          {!plus && localActive && (
            <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-on-surface-variant">
              {matchCount} of {total}
            </span>
          )}
          {expanded && (
            <button
              type="button"
              // onMouseDown so it beats the input's onBlur-collapse on mouse
              // clicks; onClick so keyboard Enter also works.
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                if (plus) exitPlus();
                else enterPlus();
              }}
              title={plus ? "Back to filtering this folder" : "Search everywhere"}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors duration-150 ${focusRing} ${
                plus ? "bg-primary text-surface" : "text-primary hover:bg-primary-container/20"
              }`}
            >
              Search+
            </button>
          )}
        </div>

        {/* Collapsed ellipsis — fills the circle and opens the local filter. */}
        {!expanded && (
          <button
            type="button"
            // On This PC there's no listing to filter locally, so open straight
            // into Search+ (the index search) instead.
            onClick={() => (isThisPC ? enterPlus() : setLocalOpen(true))}
            title={isThisPC ? "Search" : "Filter this folder"}
            aria-label={isThisPC ? "Search" : "Filter this folder"}
            className="absolute inset-0 flex items-center justify-center text-on-surface-variant transition-colors duration-150 hover:text-on-surface"
          >
            <MoreHorizontal size={18} strokeWidth={2} />
          </button>
        )}
      </div>

      {resultMenu && (
        <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <ContextMenu
            state={{ x: resultMenu.x, y: resultMenu.y, background: false }}
            onDismiss={() => setResultMenu(null)}
            selectedCount={1}
            selectedIsDir={resultMenu.item.is_dir}
            canPaste={false}
            isCurrentFavorite={false}
            onOpen={() => withMenuClosed(() => search.openResult(resultMenu.item))}
            onOpenLocation={() => withSearchClosedToo(() => explorer.openFileLocation(resultMenu.item))}
            onOpenWith={() => withMenuClosed(() => explorer.openEntryWith(resultMenu.item))}
            onOpenTerminal={() => withSearchClosedToo(() => explorer.openTerminal(resultMenu.item.path))}
            onRename={() => withSearchClosedToo(() => explorer.renameEntry(resultMenu.item))}
            onCopy={() => withMenuClosed(() => explorer.copyEntryToClipboard(resultMenu.item))}
            onCut={() => withMenuClosed(() => explorer.cutEntryToClipboard(resultMenu.item))}
            onPaste={() => {}}
            onDelete={() => withSearchClosedToo(() => explorer.deleteEntryPrompt(resultMenu.item))}
            onProperties={() => withMenuClosed(() => explorer.showEntryProperties(resultMenu.item))}
            onNewFolder={() => {}}
            onNewFile={() => {}}
            onRefresh={() => {}}
            onToggleFavorite={() => {}}
          />
        </div>
      )}

      {/* Floating filters panel — positioned above the Search+ bar so it
          doesn't consume vertical space inside it (which would push results
          off-screen on small windows). */}
      {showFilters && search.mode === "filename" && (
        <div
          ref={filtersPanelRef}
          className="pointer-events-auto fixed z-50 animate-menu-in rounded-lg border border-surface-container-highest bg-surface-container-high shadow-lg"
          style={{ top: filtersPos.top, left: filtersPos.left }}
        >
          <SearchFiltersFields filters={search.filters} onChange={search.setFilters} folderSuggestions={folderPathSuggestions} />
        </div>
      )}
    </div>
  );
}
