import { memo, useCallback, useEffect, useMemo, useRef, type DragEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp, Folder } from "lucide-react";
import { FileTypeIcon } from "../lib/fileTypeIcon";
import { formatDate, formatSize } from "../lib/format";
import { entryTypeLabel } from "../lib/entryType";
import { startDrag } from "../lib/dnd";
import { useDropTarget } from "../lib/useDropTarget";
import { useEntryKeyboard } from "../lib/useEntryKeyboard";
import type { GroupBy } from "../lib/groupEntries";
import { toDisplayItems } from "../lib/groupEntries";
import type { SortDirection, SortKey } from "../lib/sortEntries";
import type { Entry } from "../file-explorer.types";

interface EntryTableProps {
  entries: Entry[];
  selectedPaths: string[];
  // The folder currently being browsed — lets dropping onto empty space
  // (not a specific row) move/copy into it, same as real Explorer.
  currentPath: string;
  onOpen: (entry: Entry) => void;
  onSelect: (entry: Entry, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onContextMenu: (entry: Entry, x: number, y: number) => void;
  onClearSelection: () => void;
  onDragPaths: (entry: Entry) => string[];
  onDrop: (sourcePaths: string[], targetPath: string, isCopy: boolean) => void;
  // Right-click on empty space (not a row) — omitted where a background menu
  // doesn't make sense (e.g. search results aren't a single real folder).
  onBackgroundContextMenu?: (x: number, y: number) => void;
  // Paths currently on the clipboard as a Cut — dimmed like Explorer's own
  // "in transit" treatment, so it's visually clear the item hasn't moved yet.
  cutPaths?: string[];
  // A path to scroll into view once rendered (from "Open file location") —
  // cleared via onRevealed the moment it's handled, so it fires once.
  revealPath?: string | null;
  onRevealed?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortColumnClick: (key: SortKey) => void;
  groupBy: GroupBy;
  // Keyboard navigation callbacks — direct selection methods so arrow keys
  // and type-ahead can manipulate selection without simulating click events.
  onSelectOnly: (path: string) => void;
  onSelectRange: (path: string) => void;
  onDelete: () => void;
  onRename: () => void;
}

// Shared between the header and every virtualized row so columns stay
// aligned — replaces the old <table>/<colgroup> widths 1:1. A native <tr>
// can't be individually absolutely-positioned for virtualization (its
// display type blockifies and it loses table-cell alignment entirely), the
// same reason EntryGrid's tile rows are plain divs, not a CSS grid/table —
// so this is a div-based "fake table" using CSS Grid to keep the visual
// result identical.
const GRID_TEMPLATE_COLUMNS = "55% 20% 12% 13%";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Name" },
  { key: "modified", label: "Modified" },
  { key: "type", label: "Type" },
  { key: "size", label: "Size", align: "right" },
];

// The real, hard-pinned CSS height of every row (see EntryRow's `height`
// style and the header row's height below) — not just an estimate. Every row
// truncates to one line instead of wrapping, so this is exact, and the
// virtualizer never needs to dynamically remeasure to correct it.
const HEADER_ROW_SIZE = 33;
const ENTRY_ROW_SIZE = 33;

type Row = { kind: "header"; label: string } | { kind: "entry"; entry: Entry };

interface SortableHeaderProps {
  column: (typeof COLUMNS)[number];
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}

// The direction chevron only renders for the active column — same
// "state visible without hovering" standard applied to every toggle since
// the SearchModal redesign, not just an icon-only sort affordance.
function SortableHeader({ column, active, direction, onClick }: SortableHeaderProps) {
  return (
    <div
      role="columnheader"
      className={`px-3 py-2 text-left font-mono text-[11px] tracking-wide text-outline uppercase ${
        column.align === "right" ? "text-right" : ""
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-0.5 uppercase transition-colors duration-150 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container ${
          column.align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-on-surface" : ""}`}
      >
        {column.label}
        {active &&
          (direction === "asc" ? (
            <ChevronUp size={11} strokeWidth={2} />
          ) : (
            <ChevronDown size={11} strokeWidth={2} />
          ))}
      </button>
    </div>
  );
}

export function EntryTable({
  entries,
  selectedPaths,
  currentPath,
  onOpen,
  onSelect,
  onContextMenu,
  onClearSelection,
  onDragPaths,
  onDrop,
  onBackgroundContextMenu,
  cutPaths = [],
  revealPath,
  onRevealed,
  emptyTitle = "Nothing here yet",
  emptySubtitle = "Drag files in, or use New Folder / New File above",
  sortKey,
  sortDirection,
  onSortColumnClick,
  groupBy,
  onSelectOnly,
  onSelectRange,
  onDelete,
  onRename,
}: EntryTableProps) {
  // Targets the folder being browsed itself — dropping anywhere that isn't
  // a specific row (a row's own drop target, see EntryRow, stops
  // propagation so this doesn't also fire) moves/copies into
  // the current folder, same as real Explorer's own background-drop.
  const backgroundDrop = useDropTarget(currentPath, onDrop);

  const scrollRef = useRef<HTMLDivElement>(null);

  const rows: Row[] = useMemo(
    () =>
      toDisplayItems(entries, groupBy).map((item) =>
        item.kind === "header" ? { kind: "header", label: item.label } : { kind: "entry", entry: item.entry },
      ),
    [entries, groupBy],
  );

  // Vertical virtualization — same rationale as EntryGrid (real
  // virtualization bounds render cost in a directory with tens of thousands
  // of files). measureElement with Math.round locks every row to its exact
  // CSS pixel height (33px), avoiding the subpixel drift that made the
  // scrollbar thumb visibly resize when scrolling through large folders.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].kind === "header" ? HEADER_ROW_SIZE : ENTRY_ROW_SIZE),
    overscan: 8,
    // Measure each row but round to the nearest integer — getBoundingClientRect
    // returns subpixel values (e.g. 32.5px for a 33px row) due to zoom/HiDPI
    // rounding, and those fractional corrections compound over thousands of
    // rows into a visibly resizing scrollbar thumb. Rounding locks every
    // measurement to the exact CSS height, so getTotalSize() is deterministic.
    measureElement: (el) => Math.round(el.getBoundingClientRect().height),
    // The sticky column-header row above sits in the same scroll container
    // but isn't one of the virtualizer's tracked items — without telling it
    // about that leading space, its scrollToIndex/align math is computed as
    // if row 0 started at real scrollTop 0, when it actually starts
    // HEADER_ROW_SIZE lower. That constant offset made jumping to a row near
    // the bottom (arrow keys, type-ahead) undershoot by one row's height,
    // leaving it clipped at the edge instead of fully in view.
    scrollMargin: HEADER_ROW_SIZE,
    // Reserves HEADER_ROW_SIZE of "don't put an item here" space at the top
    // of the viewport for align: "start"/"auto" — without it, jumping to a
    // row near the top scrolls it to real screenY 0, which is directly
    // behind the sticky header (still visually on top of everything), so
    // the row was hidden until the user nudged the scroll further by hand.
    scrollPaddingStart: HEADER_ROW_SIZE,
  });

  // Virtualizer-aware scroll-by-path — the hook's default scrollIntoView
  // can't reach an off-screen (unmounted) virtualized row.
  const scrollToEntryRef = useRef<((path: string) => void) | null>(null);
  scrollToEntryRef.current = (path: string) => {
    const rowIndex = rows.findIndex((r) => r.kind === "entry" && r.entry.path === path);
    if (rowIndex !== -1) virtualizer.scrollToIndex(rowIndex, { align: "auto" });
  };

  // Arrow-key navigation, Enter-to-open, type-ahead jump-to-file. No
  // `gridRows` needed here (unlike EntryGrid) — EntryTable is always a
  // single column, so `entries[idx±1]` is already the correct next/prev
  // entry regardless of which display rows have group headers interspersed;
  // scrollToEntryRef is what finds the right *visual* row to scroll to.
  const entryKeyboard = useEntryKeyboard({
    entries,
    selectedPaths,
    onSelectOnly,
    onSelectRange,
    onOpen,
    onDelete,
    onRename,
    scrollRef,
    scrollToEntryRef,
    onContextMenu,
  });

  // Wrap onSelect to synchronously update the keyboard focus index when
  // the user clicks a row — without this, focusedRef only updates via
  // a post-render useEffect, so an immediate keypress after clicking
  // would start from the old position (type-ahead bug).
  const handleSelect = useCallback(
    (entry: Entry, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
      const idx = entries.findIndex((e) => e.path === entry.path);
      if (idx !== -1) entryKeyboard.focusIndex(idx);
      onSelect(entry, mods);
    },
    [entries, onSelect, entryKeyboard],
  );

  // Scroll the reveal target into view (from "Open file location"). Unlike
  // the old plain-DOM approach, the target row may not be mounted at all
  // (virtualized) — the virtualizer's own scrollToIndex is what actually
  // brings an off-screen row on-screen, same as EntryGrid. Cleared
  // immediately so it fires once.
  useEffect(() => {
    if (!revealPath) return;
    const rowIndex = rows.findIndex((r) => r.kind === "entry" && r.entry.path === revealPath);
    if (rowIndex !== -1) virtualizer.scrollToIndex(rowIndex, { align: "center" });
    onRevealed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealPath, rows]);

  if (entries.length === 0) {
    return (
      <div
        className={`themed-scroll flex min-h-0 flex-1 flex-col items-center justify-center gap-1 overflow-y-auto text-center transition-colors duration-150 ${
          backgroundDrop.isOver ? "bg-surface-container-low" : ""
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClearSelection();
        }}
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget || !onBackgroundContextMenu) return;
          e.preventDefault();
          onBackgroundContextMenu(e.clientX, e.clientY);
        }}
        onDragOver={backgroundDrop.onDragOver}
        onDragLeave={backgroundDrop.onDragLeave}
        onDrop={backgroundDrop.onDrop}
      >
        <Folder size={28} strokeWidth={1.5} className="text-outline" />
        <p className="text-sm text-on-surface-variant">{emptyTitle}</p>
        <p className="text-xs text-outline">{emptySubtitle}</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="grid"
      aria-multiselectable="true"
      onKeyDown={entryKeyboard.onKeyDown}
      className={`themed-scroll min-h-0 flex-1 overflow-y-auto pb-24 transition-colors duration-150 outline-none ${
        backgroundDrop.isOver ? "bg-surface-container-low" : ""
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClearSelection();
      }}
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget || !onBackgroundContextMenu) return;
        e.preventDefault();
        onBackgroundContextMenu(e.clientX, e.clientY);
      }}
      onDragOver={backgroundDrop.onDragOver}
      onDragLeave={backgroundDrop.onDragLeave}
      onDrop={backgroundDrop.onDrop}
    >
      <div
        role="row"
        className="sticky top-0 z-10 grid border-b border-surface-container bg-surface"
        style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
      >
        {COLUMNS.map((column) => (
          <SortableHeader
            key={column.key}
            column={column}
            active={sortKey === column.key}
            direction={sortDirection}
            onClick={() => onSortColumnClick(column.key)}
          />
        ))}
      </div>

      <div style={{ position: "relative", width: "100%", height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                // virtualRow.start is in scrollMargin-inclusive (real scroll
                // container) coordinates; this div is positioned relative to
                // its own wrapper, which starts after the sticky header, so
                // the margin has to be subtracted back out here.
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {row.kind === "header" ? (
                // A group header is a label, not a real entry — right-clicking
                // it should act like empty space (the background menu), not
                // silently do nothing. Height pinned to HEADER_ROW_SIZE for
                // the same reason EntryRow's height is pinned below.
                <div
                  className="flex h-full items-center overflow-hidden bg-surface px-3 font-mono text-[11px] uppercase tracking-wide text-outline"
                  onClick={() => onClearSelection()}
                  onContextMenu={(e) => {
                    if (!onBackgroundContextMenu) return;
                    e.preventDefault();
                    onBackgroundContextMenu(e.clientX, e.clientY);
                  }}
                >
                  {row.label}
                </div>
              ) : (
                <EntryRow
                  entry={row.entry}
                  selected={selectedPaths.includes(row.entry.path)}
                  cut={cutPaths.includes(row.entry.path)}
                  reveal={row.entry.path === revealPath}
                  onOpen={onOpen}
                  onSelect={handleSelect}
                  onContextMenu={onContextMenu}
                  onDragPaths={onDragPaths}
                  onDrop={onDrop}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface EntryRowProps {
  entry: Entry;
  selected: boolean;
  cut: boolean;
  reveal: boolean;
  onOpen: (entry: Entry) => void;
  onSelect: (entry: Entry, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onContextMenu: (entry: Entry, x: number, y: number) => void;
  onDragPaths: (entry: Entry) => string[];
  onDrop: (sourcePaths: string[], targetPath: string, isCopy: boolean) => void;
}

const EntryRow = memo(function EntryRow({
  entry,
  selected,
  cut,
  reveal,
  onOpen,
  onSelect,
  onContextMenu,
  onDragPaths,
  onDrop,
}: EntryRowProps) {
  const dropTarget = useDropTarget(entry.path, onDrop);
  // Stops propagation so a drop that lands on this specific folder row
  // doesn't also bubble up and re-trigger the table's own background drop
  // (both would otherwise fire for the same drop).
  const dropProps = entry.is_dir
    ? {
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          dropTarget.onDragOver(e);
          e.stopPropagation();
        },
        onDragLeave: dropTarget.onDragLeave,
        onDrop: (e: DragEvent<HTMLDivElement>) => {
          dropTarget.onDrop(e);
          e.stopPropagation();
        },
      }
    : {};
  return (
    <div
      role="row"
      aria-selected={selected}
      data-reveal={reveal ? "true" : undefined}
      data-entry-path={entry.path}
      draggable
      onDragStart={(e) => startDrag(e, onDragPaths(entry))}
      onClick={(e) => onSelect(entry, e)}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(entry, e.clientX, e.clientY);
      }}
      {...dropProps}
      className={`grid select-none overflow-hidden border-b border-surface-container transition-colors duration-150 hover:bg-surface-container ${
        selected ? "bg-surface-container-high" : ""
      } ${cut ? "opacity-50" : ""} ${
        entry.is_dir && dropTarget.isOver ? "outline-2 -outline-offset-2 outline-primary-container" : ""
      }`}
      // Fixed height (matching ENTRY_ROW_SIZE exactly) — content no longer
      // wraps (see the name cell's truncate below), so the virtualizer's
      // measureElement always rounds to exactly 33px, keeping getTotalSize()
      // deterministic and the scrollbar thumb stable.
      style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS, height: ENTRY_ROW_SIZE }}
    >
      <div role="gridcell" className="flex min-w-0 items-center px-3 text-[13px]">
        <span className={`flex min-w-0 items-center gap-2 ${selected ? "text-primary" : "text-on-surface"}`}>
          {entry.is_dir ? (
            <Folder size={15} strokeWidth={1.75} className="shrink-0 text-primary" />
          ) : (
            <FileTypeIcon name={entry.name} size={15} strokeWidth={1.75} className="shrink-0 text-outline" />
          )}
          <span className="min-w-0 truncate" title={entry.name}>
            {entry.name}
          </span>
        </span>
      </div>
      <div role="gridcell" className="flex items-center px-3 font-mono text-[12px] text-on-surface-variant">
        {formatDate(entry.modified_ms)}
      </div>
      <div role="gridcell" className="flex items-center px-3 font-mono text-[12px] text-on-surface-variant">
        {entryTypeLabel(entry)}
      </div>
      <div
        role="gridcell"
        className="flex items-center justify-end px-3 text-right font-mono text-[12px] text-on-surface-variant"
      >
        {formatSize(entry.size, entry.is_dir)}
      </div>
    </div>
  );
});
