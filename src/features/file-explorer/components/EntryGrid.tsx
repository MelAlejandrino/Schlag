import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Folder } from "lucide-react";
import { startDrag } from "../lib/dnd";
import { useDropTarget } from "../lib/useDropTarget";
import { useEntryKeyboard, type GridRow } from "../lib/useEntryKeyboard";
import { previewKind } from "../lib/previewKind";
import { FileTypeIcon } from "../lib/fileTypeIcon";
import { fileExplorerService } from "../services/file-explorer.service";
import type { DisplayItem, GroupBy } from "../lib/groupEntries";
import { toDisplayItems } from "../lib/groupEntries";
import type { Entry } from "../file-explorer.types";

interface EntryGridProps {
  entries: Entry[];
  selectedPaths: string[];
  currentPath: string;
  onOpen: (entry: Entry) => void;
  onSelect: (entry: Entry, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onContextMenu: (entry: Entry, x: number, y: number) => void;
  onClearSelection: () => void;
  onDragPaths: (entry: Entry) => string[];
  onDrop: (sourcePaths: string[], targetPath: string, isCopy: boolean) => void;
  onBackgroundContextMenu?: (x: number, y: number) => void;
  cutPaths?: string[];
  revealPath?: string | null;
  onRevealed?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  groupBy: GroupBy;
  size: "medium" | "large";
  onSelectOnly: (path: string) => void;
  onSelectRange: (path: string) => void;
  onDelete: () => void;
  onRename: () => void;
  onPreview?: () => void;
}

const TILE_SIZE: Record<EntryGridProps["size"], { tile: number; icon: number }> = {
  medium: { tile: 96, icon: 32 },
  large: { tile: 140, icon: 48 },
};

// Matches the scroll container's own gap-1/p-2 Tailwind classes below —
// hardcoded rather than read via getComputedStyle since those classes are
// fixed in this file, not user-configurable.
const GAP = 4;
const CONTAINER_PADDING = 16;
// Generous fixed estimate (icon/image + up to two label lines + padding +
// row gap) rather than TanStack Virtual's dynamic measureElement API — rows
// are uniform enough within one view that a fixed size per row kind is
// simple and accurate enough, without the extra ref-callback complexity.
const HEADER_ROW_SIZE = 32;

type Row = { kind: "header"; label: string } | { kind: "tiles"; entries: Entry[] };

// Chunks toDisplayItems' flat header+entry list into virtualizable rows: a
// header becomes its own single-item row, consecutive entries get grouped
// into chunks of `columns` size. Depends on `columns` (computed from the
// container's measured width, see the ResizeObserver effect below) since
// CSS's own auto-fill/minmax can no longer decide row width for us once
// individual rows are virtualized independently.
function buildRows(items: DisplayItem[], columns: number): Row[] {
  const rows: Row[] = [];
  let buffer: Entry[] = [];
  const flush = () => {
    if (buffer.length) {
      rows.push({ kind: "tiles", entries: buffer });
      buffer = [];
    }
  };
  for (const item of items) {
    if (item.kind === "header") {
      flush();
      rows.push({ kind: "header", label: item.label });
    } else {
      buffer.push(item.entry);
      if (buffer.length === columns) flush();
    }
  }
  flush();
  return rows;
}

export function EntryGrid({
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
  groupBy,
  size,
  onSelectOnly,
  onSelectRange,
  onDelete,
  onRename,
  onPreview,
}: EntryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { tile, icon } = TILE_SIZE[size];
  const [columns, setColumns] = useState(1);
  const backgroundDrop = useDropTarget(currentPath, onDrop);

  // useLayoutEffect (not useEffect) so the column count is right before the
  // first paint — otherwise there'd be a visible flash of a 1-column layout
  // before this measures the real container width. Recomputes on resize
  // (window resize, or the Sidebar/PreviewPane drag-handles changing how
  // much width is left for this pane).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const available = el.clientWidth - CONTAINER_PADDING;
      setColumns(Math.max(1, Math.floor((available + GAP) / (tile + GAP))));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tile]);

  // After-paint fallback: useLayoutEffect's compute() may read a stale
  // width if the parent flex layout (sidebar + main) hasn't settled yet.
  // useEffect fires after paint; a second pass with setTimeout catches
  // any remaining layout settling (e.g. sidebar width being applied).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const available = el.clientWidth - CONTAINER_PADDING;
      setColumns(Math.max(1, Math.floor((available + GAP) / (tile + GAP))));
    };
    compute();
    const t = setTimeout(compute, 50);
    return () => clearTimeout(t);
  }, [tile, entries]);

  const rows = useMemo(() => buildRows(toDisplayItems(entries, groupBy), columns), [entries, groupBy, columns]);
  const tileRowSize = tile + 32;

  // Vertical-only virtualization — rows are the virtualized dimension,
  // columns within a visible row render normally (no horizontal
  // virtualization needed since a row's width already fits the viewport).
  // Real virtualization (unmounting off-screen rows) is what actually fixes
  // the scroll lag a folder full of full-resolution images caused — a
  // single decoded <img> bitmap stays cheap; thousands of them mounted at
  // once (even with content-visibility: auto skipping their paint) do not.
  //
  // measureElement replaces estimated sizes with actual measured heights
  // as rows render, so getTotalSize() (and therefore the scrollbar thumb)
  // stays stable instead of recalculating every time a new row scrolls
  // into view and gets measured.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (i) => (rows[i].kind === "header" ? HEADER_ROW_SIZE : tileRowSize),
    overscan: 4,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Virtualizer-aware scroll function — the hook's default
  // scrollIntoView can't reach off-screen virtualized tiles. Stored
  // in a ref so the hook always reads the latest virtualizer.
  const scrollToEntryRef = useRef<((path: string) => void) | null>(null);
  scrollToEntryRef.current = (path: string) => {
    const rowIndex = rows.findIndex((r) => r.kind === "tiles" && r.entries.some((e) => e.path === path));
    if (rowIndex !== -1) virtualizer.scrollToIndex(rowIndex, { align: "auto" });
  };

  // Convert rows to GridRow[] for the hook — it needs to know which
  // rows are headers so ArrowUp/Down can skip them.
  const gridRows: GridRow[] = rows.map((r) =>
    r.kind === "header" ? { kind: "header" } : { kind: "tiles", entries: r.entries },
  );

  // Arrow-key navigation, Enter-to-open, type-ahead jump-to-file.
  // Called after rows/virtualizer so gridRows and scrollToEntryRef are
  // populated — the hook stores both in refs, so the onKeyDown
  // callback sees them when keydown fires (post-render).
  const entryKeyboard = useEntryKeyboard({
    entries,
    selectedPaths,
    onSelectOnly,
    onSelectRange,
    onOpen,
    onDelete,
    onRename,
    columns,
    scrollRef: containerRef,
    scrollToEntryRef,
    gridRows,
    onPreview,
    onContextMenu,
  });

  // Wrap onSelect to synchronously update the keyboard focus index when
  // the user clicks a tile — without this, focusedRef only updates via
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
  // EntryTable, the target row may not be mounted at all (virtualized), so a
  // DOM scrollIntoView won't work — the virtualizer's own scrollToIndex is
  // what actually brings an off-screen row on-screen. Find the tile row that
  // holds the path, then center it. Cleared immediately so it fires once.
  useEffect(() => {
    if (!revealPath) return;
    const rowIndex = rows.findIndex((r) => r.kind === "tiles" && r.entries.some((e) => e.path === revealPath));
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
      ref={containerRef}
      tabIndex={0}
      role="listbox"
      aria-multiselectable="true"
      onKeyDown={entryKeyboard.onKeyDown}
      className={`themed-scroll min-h-0 flex-1 overflow-y-auto p-2 pb-24 transition-colors duration-150 outline-none ${
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
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.kind === "header" ? (
                // Same treatment as EntryTable's group header — a label, not
                // a real entry, so right-clicking it should act like empty
                // space.
                <p
                  className="px-1 py-1.5 font-mono text-[11px] uppercase tracking-wide text-outline"
                  onClick={() => onClearSelection()}
                  onContextMenu={(e) => {
                    if (!onBackgroundContextMenu) return;
                    e.preventDefault();
                    onBackgroundContextMenu(e.clientX, e.clientY);
                  }}
                >
                  {row.label}
                </p>
              ) : (
                // This div's own onClick/onContextMenu (not just the outer
                // scrollable container's) is what makes right-clicking the
                // *gap* between tiles in this row work — a click there lands
                // on this grid element itself, not the outer container.
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) onClearSelection();
                  }}
                  onContextMenu={(e) => {
                    if (e.target !== e.currentTarget || !onBackgroundContextMenu) return;
                    e.preventDefault();
                    onBackgroundContextMenu(e.clientX, e.clientY);
                  }}
                >
                  {row.entries.map((entry) => (
                    <EntryTile
                      key={entry.path}
                      entry={entry}
                      iconSize={icon}
                      selected={selectedPaths.includes(entry.path)}
                      cut={cutPaths.includes(entry.path)}
                      onOpen={onOpen}
                      onSelect={handleSelect}
                      onContextMenu={onContextMenu}
                      onDragPaths={onDragPaths}
                      onDrop={onDrop}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface EntryTileProps {
  entry: Entry;
  iconSize: number;
  selected: boolean;
  cut: boolean;
  onOpen: (entry: Entry) => void;
  onSelect: (entry: Entry, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onContextMenu: (entry: Entry, x: number, y: number) => void;
  onDragPaths: (entry: Entry) => string[];
  onDrop: (sourcePaths: string[], targetPath: string, isCopy: boolean) => void;
}

const EntryTile = memo(function EntryTile({
  entry,
  iconSize,
  selected,
  cut,
  onOpen,
  onSelect,
  onContextMenu,
  onDragPaths,
  onDrop,
}: EntryTileProps) {
  const dropTarget = useDropTarget(entry.path, onDrop);
  // Stops propagation so a drop that lands on this specific tile doesn't
  // also bubble up and re-trigger the grid's own background drop (which
  // targets currentPath, not this specific tile's path).
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
  // A broken/corrupt image file, a permissions issue, or a decode failure
  // needs to fall back to the generic icon, not a broken-image glyph — this
  // is a functional fallback (tracked in state via onError below), not just
  // a visual one.
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !entry.is_dir && !imageFailed && previewKind(entry.name) === "image";

  return (
    <div
      role="option"
      aria-selected={selected}
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
      className={`flex select-none flex-col items-center gap-1 rounded-lg p-2 text-center transition-colors duration-150 hover:bg-surface-container ${
        selected ? "bg-surface-container-high" : ""
      } ${cut ? "opacity-50" : ""} ${
        entry.is_dir && dropTarget.isOver ? "outline-2 -outline-offset-2 outline-primary-container" : ""
      }`}
    >
      {showImage ? (
        // Full-resolution image via the asset protocol — no resize/cache
        // step (that's the separate, unscheduled Thumbnail System). `object-
        // contain` shows the whole image scaled to fit, matching Explorer/
        // Finder's own icon-thumbnail convention, not a cropped `cover`.
        // `loading="lazy"` defers decode until near-viewport; `decoding=
        // "async"` keeps the decode itself off the main thread once it does
        // start. Real virtualization (this file's row-based useVirtualizer)
        // is what actually bounds how many of these can be mounted/decoded
        // at once — these two attributes are a secondary, cheap layer on
        // top, not the primary fix for scroll lag in a large image folder.
        <img
          src={fileExplorerService.assetUrl(entry.path)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          style={{ width: iconSize, height: iconSize }}
          className="shrink-0 rounded object-contain"
        />
      ) : entry.is_dir ? (
        <Folder size={iconSize} strokeWidth={1.5} className="shrink-0 text-primary" />
      ) : (
        <FileTypeIcon name={entry.name} size={iconSize} strokeWidth={1.5} className="shrink-0 text-outline" />
      )}
      <span className={`line-clamp-2 w-full break-words text-[12px] ${selected ? "text-primary" : "text-on-surface"}`}>
        {entry.name}
      </span>
    </div>
  );
});
