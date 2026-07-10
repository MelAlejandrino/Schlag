import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  AlertCircle,
  ChevronDown,
  File as FileIcon,
  FileSearch,
  Folder as FolderIcon,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useSearch, useSearchTrigger } from "../useSearch";
import { useFileExplorer } from "../useFileExplorer";
import { useFileExplorerStore } from "../store/file-explorer.store";
import { THIS_PC, type ContentSearchResult, type Entry } from "../file-explorer.types";
import { folderSuggestions } from "../lib/folderSuggestions";
import { formatDate } from "../lib/format";
import { splitHighlights } from "../lib/highlightSnippet";
import { countActiveFilters, SearchFiltersFields } from "./SearchFiltersFields";
import { ContextMenu } from "./ContextMenu";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high";

const segmentClass = (active: boolean) =>
  `px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${focusRing} ${
    active ? "bg-primary-container/20 text-primary" : "text-outline hover:bg-surface-container-highest hover:text-on-surface"
  }`;

type SearchResult = Entry | ContentSearchResult;

// Both states are spelled out as text, not left to an icon+tooltip — the
// four controls this replaces (mode/keywords/scope/filters) are app-specific
// binary states with no self-evident glyph, unlike Toolbar's universally
// recognized icons (back/forward/star), so hover-to-discover was a real cost
// here. Clicking a segment sets that state directly rather than just
// flipping the current one, so a user can target the state they want without
// checking which side is currently active first.
interface SegmentedToggleProps {
  leftLabel: string;
  rightLabel: string;
  active: boolean;
  onChange: (active: boolean) => void;
  disabled?: boolean;
  title?: string;
}

function SegmentedToggle({ leftLabel, rightLabel, active, onChange, disabled, title }: SegmentedToggleProps) {
  return (
    <div
      title={title}
      className={`flex items-center overflow-hidden rounded border border-surface-container-highest ${disabled ? "opacity-40" : ""}`}
    >
      <button type="button" disabled={disabled} className={segmentClass(!active)} onClick={() => onChange(false)}>
        {leftLabel}
      </button>
      <div className="h-4 w-px shrink-0 bg-surface-container-highest" />
      <button type="button" disabled={disabled} className={segmentClass(active)} onClick={() => onChange(true)}>
        {rightLabel}
      </button>
    </div>
  );
}

function isContentResult(item: SearchResult): item is ContentSearchResult {
  return "snippet" in item;
}

// A single centered command-palette-style overlay replaces the old
// Toolbar-embedded SearchBox — one search icon opens this instead of a
// permanently-visible input plus a scope toggle plus a mode toggle plus a
// filter popover all competing for space in the toolbar. Filename and
// content search live here as one small mode toggle rather than two
// separate topbar affordances; Extension/Size/Date/Regex filters (filename
// mode only — see SearchFiltersFields) sit behind a closed-by-default
// disclosure instead of their own floating popover.
interface ResultMenuState {
  x: number;
  y: number;
  item: SearchResult;
}

export function SearchModal() {
  const search = useSearch();
  useSearchTrigger();
  const explorer = useFileExplorer();
  const currentPath = useFileExplorerStore((s) => s.currentPath);
  const favorites = useFileExplorerStore((s) => s.favorites);
  const quickAccess = useFileExplorerStore((s) => s.quickAccess);
  const isThisPC = currentPath === THIS_PC;
  const scopedToFolder = search.scopeToFolder && !isThisPC;
  const [showFilters, setShowFilters] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [resultMenu, setResultMenu] = useState<ResultMenuState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeFilterCount = countActiveFilters(search.filters);
  const folderPathSuggestions = folderSuggestions(favorites, quickAccess);

  const activeResults: SearchResult[] = search.mode === "content" ? search.orderedContentResults : search.orderedResults;

  // Refs mirror the latest render values so the window keydown listener below
  // (attached once per open) reads current results/highlight without going
  // stale, instead of re-attaching on every change.
  const activeResultsRef = useRef(activeResults);
  activeResultsRef.current = activeResults;
  const highlightedRef = useRef(highlighted);
  highlightedRef.current = highlighted;
  const openResultRef = useRef(search.openResult);
  openResultRef.current = search.openResult;

  useEffect(() => {
    if (search.isOpen) inputRef.current?.focus();
  }, [search.isOpen]);

  // List navigation lives on a `window` listener, NOT the dialog's onKeyDown,
  // because that only fires while focus is inside the dialog — and clicking a
  // (non-focusable) result row drops focus to <body>, after which ArrowUp/Down
  // fell through to the browser's default scroll instead of moving the
  // highlight. A window listener works regardless of where focus is. Only
  // armed while the modal is open. (Combobox in the filters section
  // stopPropagations its own Escape, so this never closes the modal out from
  // under it.)
  useEffect(() => {
    if (!search.isOpen) return;
    // Explicitly the DOM KeyboardEvent — this file imports React's synthetic
    // KeyboardEvent type by the same name for the dialog's onKeyDown, but a
    // window listener gets the native one.
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
        search.closeSearch();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.isOpen]);

  // Same click-outside-closes pattern FileExplorerView uses for the normal
  // directory-listing context menu, scoped locally since this one is local
  // state (a search result isn't part of `file-explorer.store.ts`'s
  // `contextMenu`/selection machinery at all — see useFileExplorer.ts's
  // openFileLocation/renameEntry/etc. comment on why).
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

  // Depends on the raw store arrays, not the derived/reordered
  // `activeResults` — that's recomputed fresh every render, so depending on
  // it here would reset the highlight (and re-run this effect) every render
  // instead of only when results actually change.
  useEffect(() => {
    setHighlighted(0);
  }, [search.results, search.contentResults, search.mode]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  if (!search.isOpen) return null;

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Arrow/Enter/Escape navigation lives on the window keydown listener
    // above (works regardless of focus — see that effect's comment). This
    // dialog-level handler is now ONLY the Tab focus-trap, which is
    // inherently focus-relative and must stay here.
    // Result rows aren't in the tab sequence at all (arrow keys manage a
    // "virtual" highlight while real focus stays on the input, per the
    // combobox/listbox ARIA pattern) — this only needs to cycle between the
    // input and the toggle/filter controls, same focus-trap shape as
    // PromptModal's.
    if (e.key !== "Tab") return;
    const focusables = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("input, button"));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Rename/Delete open PromptModal/ConfirmModal on top — both share this
  // modal's z-[60] tier, so the search overlay closes first rather than
  // risking a same-tier stacking fight. It isn't cleared (see
  // search.store.ts's closeSearch doc) so it's still there if the rename or
  // delete is cancelled. Open/Open-with/Copy/Cut/Properties don't spawn an
  // in-app modal, so the search overlay is left open for those.
  function withMenuClosed(action: () => void) {
    action();
    setResultMenu(null);
  }

  function withSearchClosedToo(action: () => void) {
    action();
    search.closeSearch();
    setResultMenu(null);
  }

  return (
    <div
      className="animate-backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={() => search.closeSearch()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="animate-dialog-in flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-surface-container-highest bg-surface-container-high shadow-lg"
        // stopPropagation keeps an in-dialog click from reaching the
        // backdrop (which closes the whole search). But that also means such
        // clicks never reach the window listener that closes the result
        // context menu — so close it here instead: any click inside the
        // dialog dismisses an open menu. Menu-item clicks live in a separate
        // sibling subtree (see the resultMenu wrapper below, which stops its
        // own propagation), so they don't trigger this.
        onClick={(e) => {
          e.stopPropagation();
          if (resultMenu) setResultMenu(null);
        }}
        onKeyDown={handleKeyDown}
      >
        <div className="border-b border-surface-container-highest">
          <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
            <Search size={18} strokeWidth={1.75} className="shrink-0 text-outline" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded={activeResults.length > 0}
              aria-controls="search-modal-results"
              aria-activedescendant={activeResults.length > 0 ? `search-result-${highlighted}` : undefined}
              className="w-full min-w-0 bg-transparent text-[15px] text-on-surface outline-none placeholder:text-outline"
              placeholder={search.mode === "content" ? "Search file contents…" : "Search files and folders…"}
              value={search.query}
              onChange={(e) => search.setQuery(e.currentTarget.value)}
            />
            {search.isSearching && (
              <Loader2 size={14} strokeWidth={2} className="shrink-0 animate-spin text-outline" />
            )}
            {search.query && (
              <button
                type="button"
                title="Clear"
                className={`shrink-0 rounded p-1 text-outline transition-colors duration-150 hover:bg-surface-container-highest hover:text-on-surface ${focusRing}`}
                onClick={() => search.setQuery("")}
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <SegmentedToggle
              leftLabel="Names"
              rightLabel="Contents"
              active={search.mode === "content"}
              onChange={(isContent) => {
                if (isContent) setShowFilters(false);
                search.setMode(isContent ? "content" : "filename");
              }}
            />
            <SegmentedToggle
              leftLabel="Exact"
              rightLabel="Keyword"
              active={search.keywordMode}
              onChange={search.setKeywordMode}
            />
            <SegmentedToggle
              leftLabel="Folder"
              rightLabel="Global"
              active={!scopedToFolder}
              disabled={isThisPC}
              title={isThisPC ? "No current folder to scope to on This PC" : undefined}
              onChange={(isGlobal) => search.setScopeToFolder(!isGlobal)}
            />
            <button
              type="button"
              title={search.mode === "content" ? "Filters only apply to name search" : undefined}
              disabled={search.mode === "content"}
              className={`flex items-center gap-1 rounded border border-surface-container-highest px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 hover:bg-surface-container-highest hover:text-on-surface disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${focusRing} ${
                activeFilterCount > 0 ? "text-primary" : "text-outline"
              }`}
              onClick={() => setShowFilters((s) => !s)}
            >
              <SlidersHorizontal size={13} strokeWidth={1.75} />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary-container text-[9px] text-white">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                size={13}
                strokeWidth={1.75}
                className={`transition-transform duration-150 ${showFilters ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        </div>

        {showFilters && search.mode === "filename" && (
          <div className="border-b border-surface-container-highest">
            <SearchFiltersFields
              filters={search.filters}
              onChange={search.setFilters}
              folderSuggestions={folderPathSuggestions}
            />
          </div>
        )}

        {search.error && (
          <div className="flex items-center gap-2 border-b border-error-container bg-error-container/20 px-4 py-2 text-[12px] text-on-error-container">
            <AlertCircle size={14} strokeWidth={1.75} className="shrink-0 text-error" />
            <span className="min-w-0 flex-1 truncate">{search.error}</span>
          </div>
        )}

        <div id="search-modal-results" role="listbox" ref={listRef} className="themed-scroll min-h-0 flex-1 overflow-y-auto">
          {!search.hasActiveQuery ? (
            <div className="flex flex-col items-center justify-center gap-1 px-4 py-14 text-center">
              <Search size={22} strokeWidth={1.5} className="text-outline" />
              <p className="text-[13px] text-on-surface-variant">Search files and folders</p>
              <p className="text-[11px] text-outline">Type a name, or toggle content search above</p>
            </div>
          ) : activeResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 px-4 py-14 text-center">
              <FileSearch size={22} strokeWidth={1.5} className="text-outline" />
              <p className="text-[13px] text-on-surface-variant">
                {search.isSearching ? "Searching…" : `No matches for "${search.query}"`}
              </p>
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

        <div className="border-t border-surface-container-highest px-4 py-2 font-mono text-[11px] text-outline">
          {/* The control bar above now states mode/match/scope persistently
              as text, so restating it here would just be the same
              information twice — this footer is keyboard hints only. */}
          ↑↓ Navigate · Enter Open · Esc Close
        </div>
      </div>

      {resultMenu && (
        // Stops the click from bubbling to the backdrop's onClick={closeSearch}
        // above — each menu button already closes the menu (and, for
        // Rename/Delete, the search overlay too) explicitly via
        // withMenuClosed/withSearchClosedToo, so this only needs to guard
        // against the backdrop's own separate close-on-click behavior.
        <div onClick={(e) => e.stopPropagation()}>
          <ContextMenu
            state={{ x: resultMenu.x, y: resultMenu.y, background: false }}
            selectedCount={1}
            selectedIsDir={resultMenu.item.is_dir}
            canPaste={false}
            isCurrentFavorite={false}
            onOpen={() => withMenuClosed(() => search.openResult(resultMenu.item))}
            onOpenLocation={() => withSearchClosedToo(() => explorer.openFileLocation(resultMenu.item))}
            onOpenWith={() => withMenuClosed(() => explorer.openEntryWith(resultMenu.item))}
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
    </div>
  );
}

interface SearchResultRowProps {
  item: SearchResult;
  index: number;
  highlighted: boolean;
  onHover: () => void;
  onOpen: () => void;
  onContextMenu: (x: number, y: number) => void;
}

function SearchResultRow({ item, index, highlighted, onHover, onOpen, onContextMenu }: SearchResultRowProps) {
  const Icon = item.is_dir ? FolderIcon : FileIcon;

  return (
    <div
      id={`search-result-${index}`}
      data-index={index}
      role="option"
      aria-selected={highlighted}
      // Hover previews the selection (moves the highlight here), so ↑/↓ and
      // Enter act on whatever the pointer is over. Single click intentionally
      // does nothing — opening is double-click or Enter only, matching
      // EntryTable/EntryGrid's model, so a stray click can't fire off the
      // wrong file. Arrow navigation works regardless of focus via the
      // window keydown listener, so no focus-retention hack is needed here.
      onMouseEnter={onHover}
      onDoubleClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e.clientX, e.clientY);
      }}
      className={`flex cursor-default select-none flex-col gap-0.5 px-4 py-2 transition-colors duration-100 ${
        highlighted ? "bg-surface-container-highest" : ""
      }`}
    >
      <div className="flex items-center gap-2 text-[13px]">
        <Icon size={15} strokeWidth={1.75} className={item.is_dir ? "shrink-0 text-primary" : "shrink-0 text-outline"} />
        <span className={`truncate font-medium ${highlighted ? "text-primary" : "text-on-surface"}`}>{item.name}</span>
        {!isContentResult(item) && (
          <span className="ml-auto shrink-0 font-mono text-[11px] text-outline">{formatDate(item.modified_ms)}</span>
        )}
      </div>
      <p className="truncate pl-[23px] text-[11px] text-outline" title={item.path}>
        {item.path}
      </p>
      {isContentResult(item) && (
        <p className="line-clamp-2 pl-[23px] text-[12px] leading-snug text-on-surface-variant">
          {splitHighlights(item.snippet, item.highlight_ranges).map((seg, i) =>
            seg.highlighted ? (
              <mark key={i} className="rounded-sm bg-primary-container/30 px-0.5 text-primary">
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      )}
    </div>
  );
}
