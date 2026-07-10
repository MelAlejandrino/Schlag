import { useEffect, useRef, type DragEvent } from "react";
import { ChevronDown, ChevronUp, Folder } from "lucide-react";
import { FileTypeIcon } from "../lib/fileTypeIcon";
import { formatDate, formatSize } from "../lib/format";
import { entryTypeLabel } from "../lib/entryType";
import { startDrag } from "../lib/dnd";
import { useDropTarget } from "../lib/useDropTarget";
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
}

const headerClass = "sticky top-0 bg-surface px-3 py-2 text-left font-mono text-[11px] tracking-wide text-outline uppercase";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Name" },
  { key: "modified", label: "Modified" },
  { key: "type", label: "Type" },
  { key: "size", label: "Size", align: "right" },
];

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
    <th className={`${headerClass} ${column.align === "right" ? "text-right" : ""}`}>
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
    </th>
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
}: EntryTableProps) {
  // Targets the folder being browsed itself — dropping anywhere that isn't
  // a specific row (a row's own drop target, see EntryRow, stops
  // propagation so this doesn't also fire underneath it) moves/copies into
  // the current folder, same as real Explorer's own background-drop.
  const backgroundDrop = useDropTarget(currentPath, onDrop);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll the reveal target into view once it's in the rendered listing
  // (from "Open file location"). The matching row carries data-reveal, so
  // this finds it without escaping backslash-laden Windows paths into a
  // querySelector. block: "center" puts it comfortably mid-view rather than
  // flush against the top edge under the sticky header. Cleared immediately
  // so it never re-fires on an unrelated re-render.
  useEffect(() => {
    if (!revealPath) return;
    scrollRef.current?.querySelector('[data-reveal="true"]')?.scrollIntoView({ block: "center" });
    onRevealed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealPath, entries]);

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

  const items = toDisplayItems(entries, groupBy);

  return (
    <div
      ref={scrollRef}
      className={`themed-scroll flex min-h-0 flex-1 flex-col overflow-y-auto transition-colors duration-150 ${
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
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <SortableHeader
                key={column.key}
                column={column}
                active={sortKey === column.key}
                direction={sortDirection}
                onClick={() => onSortColumnClick(column.key)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) =>
            item.kind === "header" ? (
              // A group header is a label, not a real entry — right-clicking
              // it should act like empty space (the background menu), not
              // silently do nothing.
              <tr
                key={`group-${item.label}-${index}`}
                onClick={() => onClearSelection()}
                onContextMenu={(e) => {
                  if (!onBackgroundContextMenu) return;
                  e.preventDefault();
                  onBackgroundContextMenu(e.clientX, e.clientY);
                }}
              >
                <td colSpan={COLUMNS.length} className="bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-outline">
                  {item.label}
                </td>
              </tr>
            ) : (
              <EntryRow
                key={item.entry.path}
                entry={item.entry}
                selected={selectedPaths.includes(item.entry.path)}
                cut={cutPaths.includes(item.entry.path)}
                reveal={item.entry.path === revealPath}
                onOpen={onOpen}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                onDragPaths={onDragPaths}
                onDrop={onDrop}
              />
            ),
          )}
        </tbody>
      </table>
      {/* Always-clickable trailing empty space below the last row — without
          this, a folder whose contents exactly fill (or overflow) the view
          leaves no background left to right-click for the New Folder/
          New File/Paste/Refresh menu. Uses a fixed min-height instead of
          flex-1, because flex-1 inside a scrollable flex-col behaves
          inconsistently: it grows when there's room (no scroll), then
          collapses to zero once the content overflows and the container
          starts scrolling — causing the scrollbar thumb to change size
          as you scroll. A fixed min-height always contributes the same
          amount to the scrollable area. */}
      <div
        className="min-h-24"
        onClick={() => onClearSelection()}
        onContextMenu={(e) => {
          if (!onBackgroundContextMenu) return;
          e.preventDefault();
          onBackgroundContextMenu(e.clientX, e.clientY);
        }}
      />
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

function EntryRow({ entry, selected, cut, reveal, onOpen, onSelect, onContextMenu, onDragPaths, onDrop }: EntryRowProps) {
  const dropTarget = useDropTarget(entry.path, onDrop);
  // Stops propagation so a drop that lands on this specific folder row
  // doesn't also bubble up and re-trigger the table's own background drop
  // (which targets the currently browsed folder, not this row's folder).
  const dropProps = entry.is_dir
    ? {
        onDragOver: (e: DragEvent<HTMLTableRowElement>) => {
          dropTarget.onDragOver(e);
          e.stopPropagation();
        },
        onDragLeave: dropTarget.onDragLeave,
        onDrop: (e: DragEvent<HTMLTableRowElement>) => {
          dropTarget.onDrop(e);
          e.stopPropagation();
        },
      }
    : {};
  return (
    <tr
      draggable
      data-reveal={reveal ? "true" : undefined}
      onDragStart={(e) => startDrag(e, onDragPaths(entry))}
      onClick={(e) => onSelect(entry, e)}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(entry, e.clientX, e.clientY);
      }}
      {...dropProps}
      className={`select-none border-b border-surface-container transition-colors duration-150 hover:bg-surface-container ${
        selected ? "bg-surface-container-high" : ""
      } ${cut ? "opacity-50" : ""} ${
        entry.is_dir && dropTarget.isOver ? "outline-2 -outline-offset-2 outline-primary-container" : ""
      }`}
    >
      <td className="px-3 py-1.5 text-[13px]">
        <span className={`flex items-center gap-2 ${selected ? "text-primary" : "text-on-surface"}`}>
          {entry.is_dir ? (
            <Folder size={15} strokeWidth={1.75} className="shrink-0 text-primary" />
          ) : (
            <FileTypeIcon name={entry.name} size={15} strokeWidth={1.75} className="shrink-0 text-outline" />
          )}
          <span className="truncate">{entry.name}</span>
        </span>
      </td>
      <td className="px-3 py-1.5 font-mono text-[12px] text-on-surface-variant">{formatDate(entry.modified_ms)}</td>
      <td className="px-3 py-1.5 font-mono text-[12px] text-on-surface-variant">{entryTypeLabel(entry)}</td>
      <td className="px-3 py-1.5 text-right font-mono text-[12px] text-on-surface-variant">
        {formatSize(entry.size, entry.is_dir)}
      </td>
    </tr>
  );
}
