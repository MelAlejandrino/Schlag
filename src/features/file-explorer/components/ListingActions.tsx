import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ChevronDown,
  FilePlus,
  FolderPlus,
  Grid2x2,
  Grid3x3,
  List,
  Plus,
  TerminalSquare,
} from "lucide-react";
import { ViewMenu } from "./ViewMenu";
import { usePopoverPosition } from "../lib/usePopoverPosition";
import type { GroupBy } from "../lib/groupEntries";
import type { SortDirection, SortKey } from "../lib/sortEntries";
import type { ViewMode } from "../store/file-explorer.store";

interface ListingActionsProps {
  isThisPC: boolean;
  insideZip: boolean;
  onOpenTerminal: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
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
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-low";

// Borderless with a tonal hover fill — same treatment as EditActionsBar's own
// buttons so Terminal/New/View sit consistently alongside Cut/Copy/etc. on the
// second row. Each carries a visible text label (a terminal/plus/grid glyph has
// no self-evident meaning); New and View add a chevron since they open menus.
const ghostButtonClass = `flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-high hover:text-on-surface disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant ${focusRing}`;

const menuItemClass =
  "flex items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface transition-colors duration-150 hover:bg-surface-container-highest";

const iconProps = { size: 15, strokeWidth: 1.75 };

// Distinct glyph per view mode so the View button shows what's active without
// opening the menu (List rows / dense medium grid / sparse large grid).
const viewModeIcon: Record<ViewMode, typeof List> = {
  list: List,
  medium: Grid3x3,
  large: Grid2x2,
};

// Click a trigger button, toggle a small menu anchored under it, dismiss on an
// outside click or a resize. usePopoverPosition owns the measure-then-clamp
// positioning each menu needs once open.
function useToolbarMenu(triggerRef: RefObject<HTMLButtonElement | null>) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  // Wrapped around the rendered menu at each call site below, so clicking a
  // toggle *inside* ViewMenu (a persistent-controls popup) doesn't count as an
  // "outside click" and close the menu on every click.
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setAnchor(null);
    };
    const closeOnResize = () => setAnchor(null);
    window.addEventListener("click", closeOnOutsideClick);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("click", closeOnOutsideClick);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [anchor, triggerRef]);

  function toggle() {
    setAnchor((current) => {
      if (current) return null;
      const rect = triggerRef.current?.getBoundingClientRect();
      // Menus open upward from the second row: it sits near the top of the
      // window, so anchoring below the button is fine (usePopoverPosition
      // still clamps to the viewport).
      return rect ? { x: rect.left, y: rect.bottom + 4 } : null;
    });
  }

  return { anchor, toggle, close: () => setAnchor(null), menuRef };
}

interface NewMenuProps {
  x: number;
  y: number;
  onNewFolder: () => void;
  onNewFile: () => void;
  onDismiss: () => void;
}

function NewMenu({ x, y, onNewFolder, onNewFile, onDismiss }: NewMenuProps) {
  const { ref, pos } = usePopoverPosition(x, y);
  return (
    <div
      ref={ref}
      role="menu"
      className="animate-menu-in fixed z-[70] flex w-44 flex-col gap-0.5 rounded-lg border border-surface-container-highest bg-surface-container-high p-1 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      <button
        type="button"
        role="menuitem"
        className={menuItemClass}
        onClick={() => {
          onDismiss();
          onNewFolder();
        }}
      >
        <FolderPlus size={15} strokeWidth={1.75} className="text-on-surface-variant" />
        New folder
        <span className="ml-auto font-mono text-[10px] text-outline">Ctrl+N</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuItemClass}
        onClick={() => {
          onDismiss();
          onNewFile();
        }}
      >
        <FilePlus size={15} strokeWidth={1.75} className="text-on-surface-variant" />
        New file
      </button>
    </div>
  );
}

// The Terminal / New / View cluster. Lives on the second row (EditActionsBar's
// right slot) alongside the edit actions — all "act on the current folder"
// controls. The fixed-positioned popovers render at document level, so only the
// trigger buttons need to sit in the row.
export function ListingActions({
  isThisPC,
  insideZip,
  onOpenTerminal,
  onNewFolder,
  onNewFile,
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
}: ListingActionsProps) {
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const viewMenu = useToolbarMenu(viewButtonRef);
  const newMenu = useToolbarMenu(newButtonRef);
  const ViewIcon = viewModeIcon[viewMode];

  return (
    <>
      <button className={ghostButtonClass} title="Open Terminal" onClick={onOpenTerminal} disabled={isThisPC || insideZip}>
        <TerminalSquare {...iconProps} />
        <span>Terminal</span>
      </button>

      <button
        ref={newButtonRef}
        className={`${ghostButtonClass} ${newMenu.anchor ? "bg-primary-container/15 text-primary" : ""}`}
        title="New folder or file"
        aria-haspopup="menu"
        aria-expanded={!!newMenu.anchor}
        onClick={newMenu.toggle}
        disabled={isThisPC || insideZip}
      >
        <Plus {...iconProps} />
        <span>New</span>
        <ChevronDown size={14} strokeWidth={1.75} className={`transition-transform duration-150 ${newMenu.anchor ? "rotate-180" : ""}`} />
      </button>

      <button
        ref={viewButtonRef}
        className={`${ghostButtonClass} ${viewMenu.anchor ? "bg-primary-container/15 text-primary" : ""}`}
        title="View, sort, and group"
        aria-haspopup="menu"
        aria-expanded={!!viewMenu.anchor}
        onClick={viewMenu.toggle}
      >
        <ViewIcon {...iconProps} />
        <span>View</span>
        <ChevronDown size={14} strokeWidth={1.75} className={`transition-transform duration-150 ${viewMenu.anchor ? "rotate-180" : ""}`} />
      </button>

      {/* display:contents so these wrappers don't count as flex items in the
          second row — otherwise each open menu claims a gap slot and shifts the
          row. The fixed-positioned menus inside are unaffected; .contains()
          still works for outside-click detection (it's DOM-tree based). */}
      {newMenu.anchor && (
        <div ref={newMenu.menuRef} className="contents">
          <NewMenu x={newMenu.anchor.x} y={newMenu.anchor.y} onNewFolder={onNewFolder} onNewFile={onNewFile} onDismiss={newMenu.close} />
        </div>
      )}

      {viewMenu.anchor && (
        <div ref={viewMenu.menuRef} className="contents">
          <ViewMenu
            x={viewMenu.anchor.x}
            y={viewMenu.anchor.y}
            onDismiss={viewMenu.close}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSortKeyChange={onSortKeyChange}
            onSortDirectionChange={onSortDirectionChange}
            groupBy={groupBy}
            onGroupByChange={onGroupByChange}
            groupOrder={groupOrder}
            onGroupOrderChange={onGroupOrderChange}
          />
        </div>
      )}
    </>
  );
}
