import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ChevronDown, Loader2, X } from "lucide-react";
import { useSearch, useSearchTrigger } from "../useSearch";
import { useFileExplorerStore } from "../store/file-explorer.store";
import { useSearchStore } from "../store/search.store";
import { THIS_PC, type Entry } from "../file-explorer.types";
import { filterEntries } from "../lib/filterEntries";
import { folderSuggestions } from "../lib/folderSuggestions";
import { countActiveFilters, SearchFiltersFields } from "./SearchFiltersFields";

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

// A floating bar anchored at the bottom-center of the listing. Collapsed to
// nothing (w-0/opacity-0) until opened — the entry point is the Toolbar's
// Search button / Ctrl+F, both via requestFocusFilter. Two levels once open:
//
//  • Local (default): a rounded input that narrows the *current folder's*
//    already-loaded entries client-side (filterEntries) — instant, no backend.
//  • Search+ : clicking the "Search+" button turns the border to the accent
//    colour and reveals the full index search controls (name/content, keyword,
//    scope, filters) — the app's main search, backed by the shared search
//    store. Its results are pushed into the main directory listing itself (via
//    store.setSearchResults) rather than shown inside this bar, so they behave
//    like real entries (select/drag/right-click/sort). On This PC it opens
//    straight into this level.
//
// The container width/border transition between the two, so the upgrade reads
// as the bar growing rather than a new surface appearing.
export function FilterBar() {
  const search = useSearch();
  useSearchTrigger();
  const setSearchResults = useFileExplorerStore((s) => s.setSearchResults);
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
  // On This PC the bar opens straight into Search+ from w-0 (a much longer
  // travel than the local→plus grow), so it uses a slower 500ms reveal. This
  // flag stays set through the close transition too, otherwise closing would
  // snap back at the default 300ms the instant `plus` flips false.
  const [slowAnim, setSlowAnim] = useState(false);
  const slowAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setSlowAnimFor(duration: number) {
    setSlowAnim(true);
    if (slowAnimTimer.current) clearTimeout(slowAnimTimer.current);
    slowAnimTimer.current = setTimeout(() => setSlowAnim(false), duration);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  const [filtersPos, setFiltersPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const activeFilterCount = countActiveFilters(search.filters);
  const folderPathSuggestions = folderSuggestions(favorites, quickAccess);
  const tags = useFileExplorerStore((s) => s.tags);
  const activeResults: Entry[] = search.mode === "content" ? search.orderedContentResults : search.orderedResults;

  // Push Search+ results into the main listing (or clear it back to the
  // folder when the query is empty / Search+ closes). Depends on the raw
  // store arrays (stable refs), not `activeResults` (a fresh array every
  // render) — otherwise this would re-fire, and clobber selection, on every
  // render. store.setSearchResults organizes + resets selection.
  useEffect(() => {
    setSearchResults(plus && search.hasActiveQuery ? activeResults : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plus, search.hasActiveQuery, search.results, search.contentResults, search.mode, search.query, search.filters]);

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
    if (isThisPC) setSlowAnimFor(500);
    search.openSearch();
  }
  function exitPlus() {
    setFilterQuery("");
    search.clear();
    search.closeSearch();
    setShowFilters(false);
    if (isThisPC) setSlowAnimFor(500);
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

  // Outside-click closes Search+ ONLY when there's no query — an empty
  // Search+ has no results in the listing to interact with, so a click
  // elsewhere means "never mind." Once a query is typed the results live in
  // the main listing (outside this bar) and clicking one to select/open it is
  // the whole point, so the listener isn't even attached then. The local
  // filter deliberately stays put on outside clicks (same as before): narrow,
  // then click the matches. Both also dismiss via Escape / the Search+ toggle.
  useEffect(() => {
    if (!plus || search.hasActiveQuery) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      if (filtersPanelRef.current?.contains(e.target as Node)) return;
      exitPlus();
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plus, search.hasActiveQuery]);

  // Escape exits Search+ from anywhere — focus is often on a selected result
  // row in the listing, not this bar's input, once the user starts clicking
  // results. On a window listener for that reason.
  useEffect(() => {
    if (!plus) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        exitPlus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plus]);

  // Both levels are transient overlays tied to the current view: switching
  // folder *or* tab collapses the local filter and closes Search+, matching
  // how the old search behaved (it never stuck around across navigation).
  // Also dismisses when the terminal opens to avoid overlap.
  const terminalOpen = useFileExplorerStore((s) => s.terminalOpen);
  useEffect(() => {
    setFilterQuery("");
    setLocalOpen(false);
    setShowFilters(false);
    setSlowAnim(false);
    if (slowAnimTimer.current) clearTimeout(slowAnimTimer.current);
    if (useSearchStore.getState().isOpen) search.closeSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, activeTabId, terminalOpen]);

  const value = plus ? search.query : filterQuery;
  const placeholder = plus
    ? search.mode === "content"
      ? "Search file contents…"
      : "Search files and folders…"
    : "Filter items in this folder…";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex items-end justify-center gap-2">
      <div
        ref={containerRef}
        className={`pointer-events-auto relative flex flex-col overflow-hidden border bg-surface-container-high/95 shadow-lg backdrop-blur transition-[width,border-color,opacity] duration-300 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none max-w-[88vw] ${slowAnim ? "duration-500" : ""} ${
          plus
            ? "w-[34rem] rounded-2xl border-primary opacity-100"
            : expanded
              ? "w-96 rounded-full border-surface-container-highest opacity-100"
              : "pointer-events-none w-0 rounded-full border-transparent opacity-0"
        }`}
      >
        {/* Search+ controls (mode/scope/filters) grow upward above the input
            since the container's bottom edge is pinned (bottom-4). The results
            themselves render in the main directory listing, not here. */}
        {plus && (
          <div className="animate-plus-controls-in">
            {search.error && (
              <div className="flex items-center gap-2 border-t border-error-container bg-error-container/20 px-4 py-2 text-[12px] text-on-error-container">
                <AlertCircle size={14} strokeWidth={1.75} className="shrink-0 text-error" />
                <span className="min-w-0 flex-1 truncate">{search.error}</span>
              </div>
            )}


            <div className="flex flex-nowrap items-center gap-2 border-t border-surface-container-highest px-3.5 py-2">
              <SegmentedToggle
                leftLabel="Names"
                rightLabel="Contents"
                active={search.mode === "content"}
                onChange={(isContent) => {
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
                className={`flex items-center gap-1 rounded border border-surface-container-highest px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 hover:bg-surface-container-highest hover:text-on-surface ${focusRing} ${
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
          </div>
        )}

        {/* Input row — always present; the bottom of the control both when
            collapsed (clipped to the circle) and expanded. */}
        <div className={`flex items-center gap-2 ${plus ? "border-t border-surface-container-highest px-3.5 py-2" : "px-3.5 py-2"}`}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => (plus ? search.setQuery(e.target.value) : setFilterQuery(e.target.value))}
            onBlur={() => {
              if (!plus && !filterQuery.trim()) setLocalOpen(false);
            }}
            onKeyDown={(e) => {
              // Escape while in Search+ is handled by the window listener above
              // (focus is often on a result row, not here); the local filter's
              // own Escape stays local so it doesn't bubble to app shortcuts.
              if (e.key === "Escape" && !plus) {
                e.stopPropagation();
                setFilterQuery("");
                setLocalOpen(false);
                inputRef.current?.blur();
              } else if (e.key === "Enter" && plus) {
                // Enter opens the best result (promoteExactMatch already put an
                // exact name match first) — typing a full name + Enter reliably
                // opens that file rather than making the user reach for the mouse.
                e.preventDefault();
                if (activeResults[0]) search.openResult(activeResults[0]);
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
      </div>

      {/* Standalone close — a sibling of the bar, not crammed inside it.
          Present in both levels; closes Search+ or the local filter. */}
      {expanded && (
        <button
          type="button"
          // onMouseDown beats the input's onBlur-collapse on mouse clicks.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (plus) {
              exitPlus();
            } else {
              setFilterQuery("");
              setLocalOpen(false);
            }
            inputRef.current?.blur();
          }}
          title={plus ? "Close search" : "Close filter"}
          aria-label={plus ? "Close search" : "Close filter"}
          className={`pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-surface-container-highest bg-surface-container-high/95 text-outline shadow-lg backdrop-blur transition-colors duration-150 hover:bg-surface-container-highest hover:text-on-surface ${focusRing}`}
        >
          <X size={20} strokeWidth={2} />
        </button>
      )}

      {/* Floating filters panel — positioned above the Search+ bar so it
          doesn't consume vertical space inside it (which would push results
          off-screen on small windows). */}
      {showFilters && (
        <div
          ref={filtersPanelRef}
          className="pointer-events-auto fixed z-50 animate-menu-in rounded-lg border border-surface-container-highest bg-surface-container-high shadow-lg"
          style={{ top: filtersPos.top, left: filtersPos.left }}
        >
          <SearchFiltersFields filters={search.filters} onChange={search.setFilters} folderSuggestions={folderPathSuggestions} tags={tags} />
        </div>
      )}
    </div>
  );
}
