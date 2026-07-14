import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMenuKeyboard } from "../lib/useMenuKeyboard";
import type { GroupBy } from "../lib/groupEntries";
import type { SortDirection, SortKey } from "../lib/sortEntries";
import type { ViewMode } from "../store/file-explorer.store";

interface ViewMenuProps {
  x: number;
  y: number;
  onDismiss: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortKeyChange: (key: SortKey) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  groupBy: GroupBy;
  onGroupByChange: (groupBy: GroupBy) => void;
  groupOrder: SortDirection;
  onGroupOrderChange: (direction: SortDirection) => void;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high";

// Same visual language as SearchModal's own (binary) SegmentedToggle — active
// segment gets the primary-tinted fill, inactive stays outline-colored.
const segmentClass = (active: boolean) =>
  `px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors duration-150 ${focusRing} ${
    active
      ? "bg-primary-container/20 text-primary"
      : "text-outline hover:bg-surface-container-highest hover:text-on-surface"
  }`;

const SECTION_LABEL_CLASS = "font-mono text-[11px] uppercase tracking-wide text-outline";

const directionButtonClass = `flex shrink-0 items-center justify-center rounded border border-surface-container-highest p-1.5 text-outline transition-colors duration-150 hover:border-primary-container hover:text-on-surface ${focusRing}`;

interface SegmentedRowProps<T extends string> {
  options: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}

// A multi-option sibling to SearchModal's binary SegmentedToggle — View/
// Sort-by/Group-by each have 3-4 choices, not 2. Collapses what used to be a
// full vertical radio list (one row per option) into a single row; that
// list, repeated three times with direction rows alongside, is what made the
// menu tall enough to clip on a short app window in the first place.
function SegmentedRow<T extends string>({ options, active, onChange }: SegmentedRowProps<T>) {
  return (
    <div className="flex items-center overflow-hidden rounded border border-surface-container-highest">
      {options.map((option, i) => (
        <div key={option.key} className="flex items-center">
          {i > 0 && <div className="h-4 w-px shrink-0 bg-surface-container-highest" />}
          <button
            type="button"
            aria-pressed={active === option.key}
            className={segmentClass(active === option.key)}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </button>
        </div>
      ))}
    </div>
  );
}

// A single toggle icon rather than two separate "Ascending"/"Descending"
// rows — an up/down sort arrow is an already-universal convention (every
// spreadsheet and table UI uses it), unlike the ambiguous single-icon
// toggles replaced elsewhere in this app, so it doesn't need a text label to
// be self-evident.
function DirectionButton({ direction, onChange }: { direction: SortDirection; onChange: (d: SortDirection) => void }) {
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;
  const label = direction === "asc" ? "Ascending — click for descending" : "Descending — click for ascending";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={directionButtonClass}
      onClick={() => onChange(direction === "asc" ? "desc" : "asc")}
    >
      <Icon size={13} strokeWidth={2} />
    </button>
  );
}

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: "list", label: "List" },
  { key: "medium", label: "Medium" },
  { key: "large", label: "Large" },
];

const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "size", label: "Size" },
  { key: "modified", label: "Modified" },
];

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "none", label: "None" },
  { key: "type", label: "Type" },
  { key: "modified", label: "Modified" },
  { key: "size", label: "Size" },
];

// A Toolbar dropdown, not a shared abstraction with ContextMenu — considered
// and declined: the two have different content shapes (per-entry actions vs.
// view-settings controls), and forcing a shared popover component for two
// dissimilar call sites right now would be premature generalization. Reuses
// ContextMenu's own measure-then-clamp positioning technique though
// (useLayoutEffect + getBoundingClientRect, corrected before paint so
// there's no visible jump when it would otherwise clip a window edge).
//
// Redesigned (shaped via /impeccable shape) from a long vertical radio-list
// — View/Sort-by/Group-by each one row per option, plus separate
// Ascending/Descending rows for both Sort and Group — into three compact
// single-row segmented controls with an inline direction icon each. That
// vertical-list version could clip on a short app window even with the
// clamp logic above, since clamping repositions the menu but can't shrink
// content taller than the viewport is. A max-height + internal scroll is
// kept as a defensive fallback regardless, in case this ever grows content
// again.
export function ViewMenu({
  x,
  y,
  onDismiss,
  viewMode,
  onViewModeChange,
  sortKey,
  sortDirection,
  onSortKeyChange,
  onSortDirectionChange,
  groupBy,
  onGroupByChange,
  groupOrder,
  onGroupOrderChange,
}: ViewMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: y, left: x });
  // Not a role="menu" — its content is persistent toggle controls, not
  // dismiss-on-activate commands, so the ARIA menu pattern doesn't fit. Reused
  // here purely for its Escape-to-close handling; the arrow-key/menuitem
  // lookup inside finds nothing (there are no [role="menuitem"] elements) and
  // simply no-ops, which is fine — real Tab order already moves between the
  // actual buttons.
  const menuKeyboard = useMenuKeyboard(menuRef, onDismiss);

  // useMenuKeyboard's own auto-focus only targets [role="menuitem"]
  // elements, none of which exist here — without focus landing somewhere
  // inside this popup, a later Escape keydown would still target whatever
  // had focus before it opened (the Toolbar button, outside this DOM
  // subtree) and never reach this container's own onKeyDown at all, since
  // keyboard events bubble from the focused element, not from a mouse
  // click's coordinates. Focusing the container itself (tabIndex={-1}
  // below, focusable but not Tab-reachable) fixes that.
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    setPos({ top, left });
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      role="group"
      aria-label="View, sort, and group options"
      tabIndex={-1}
      onKeyDown={menuKeyboard.onKeyDown}
      className="animate-menu-in themed-scroll fixed z-[70] flex max-h-[calc(100vh-16px)] w-72 flex-col gap-3 overflow-y-auto rounded-lg border border-surface-container-highest bg-surface-container-high p-3 shadow-lg outline-none"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex flex-col gap-1.5">
        <span className={SECTION_LABEL_CLASS}>View</span>
        <SegmentedRow options={VIEW_MODES} active={viewMode} onChange={onViewModeChange} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={SECTION_LABEL_CLASS}>Sort by</span>
        <div className="flex items-center gap-1.5">
          <SegmentedRow options={SORT_KEYS} active={sortKey} onChange={onSortKeyChange} />
          <DirectionButton direction={sortDirection} onChange={onSortDirectionChange} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={SECTION_LABEL_CLASS}>Group by</span>
        <div className="flex items-center gap-1.5">
          <SegmentedRow options={GROUP_OPTIONS} active={groupBy} onChange={onGroupByChange} />
          {/* Only meaningful (and only shown) once a real grouping is
              chosen — deliberately separate from Sort's own direction, see
              the store's organizeEntries doc comment for why. */}
          {groupBy !== "none" && <DirectionButton direction={groupOrder} onChange={onGroupOrderChange} />}
        </div>
      </div>
    </div>
  );
}
