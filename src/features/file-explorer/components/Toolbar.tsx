import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FilePlus,
  FolderPlus,
  LayoutGrid,
  Plus,
  RotateCw,
  Search,
  TerminalSquare,
} from "lucide-react";
import { AddressBar } from "./AddressBar";
import { ViewMenu } from "./ViewMenu";
import { usePopoverPosition } from "../lib/usePopoverPosition";
import { useRefreshAnimation } from "../lib/useRefreshAnimation";
import type { GroupBy } from "../lib/groupEntries";
import type { SortDirection, SortKey } from "../lib/sortEntries";
import type { ViewMode } from "../store/file-explorer.store";

interface ToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoUp: boolean;
  isThisPC: boolean;
  isCurrentFavorite: boolean;
  currentPath: string;
  addressInput: string;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  onToggleFavorite: () => void;
  onAddressChange: (value: string) => void;
  onAddressSubmit: () => void;
  onNavigate: (path: string) => void;
  onOpenSearch: () => void;
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
  focusAddressBar?: number;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-low";

// The joined "browser chrome" pill — back/forward/up/refresh behave as one
// segmented control (only this cluster keeps its own border box; see the
// file-level note below on why the rest of the bar dropped theirs).
const groupButtonClass = `flex items-center justify-center bg-surface-container px-2.5 py-1.5 text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-high hover:text-on-surface disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface-container disabled:hover:text-on-surface-variant ${focusRing}`;

// Ungrouped action icons (search / create / preview / view) — borderless by
// default, a tonal hover fill instead of a border box. Redesigned away from
// this bar's old shape, which wrapped nearly every 1-2 button cluster in its
// own bordered pill (nav, refresh, star, new-folder/file, preview/view —
// five separate boxes before the address bar even started). That read as
// busy chrome, not restraint: DESIGN.md's own "subtle borders and tonal
// layering carry hierarchy, not ornament" argues for fewer boxes, not more.
// All of these are plain launchers (no typing happens in them), so they're
// sized identically — a first pass gave Search a wide labeled pill on the
// theory that this app's flagship feature deserved more visual weight, but
// that read as oversized for a button that can't actually take a keystroke;
// a same-size icon plus its tooltip carries the same information.
const ghostButtonClass = `flex items-center justify-center rounded-lg p-2 text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-high hover:text-on-surface disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant ${focusRing}`;

const menuItemClass =
  "flex items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface transition-colors duration-150 hover:bg-surface-container-highest";

const iconProps = { size: 16, strokeWidth: 1.75 };

// Shared by the two toolbar popups (New, View) — click a trigger button,
// toggle a small menu anchored under it, dismiss on an outside click or a
// resize. Kept local to this file (not lib/) since both call sites live
// here; usePopoverPosition (below) still owns the separate measure-then-
// clamp positioning math each menu needs once open.
function useToolbarMenu(triggerRef: RefObject<HTMLButtonElement | null>) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  // Wrapped around the rendered menu at each call site below. Without this,
  // "outside click" only ever checked the trigger button — so clicking any
  // toggle *inside* ViewMenu (a persistent-controls popup, not a
  // dismiss-on-activate one, per its own doc comment) still counted as
  // "outside" and closed the menu on every single click.
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

// New folder / new file used to be two permanent icon buttons — collapsed
// into one "New" trigger (the same Plus glyph TabBar's own new-tab button
// already uses for "create one of these") plus a two-item popup, since
// that's one fewer always-visible button for an action used far less often
// than navigating or viewing.
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

export function Toolbar({
  canGoBack,
  canGoForward,
  canGoUp,
  isThisPC,
  isCurrentFavorite,
  currentPath,
  addressInput,
  onBack,
  onForward,
  onUp,
  onRefresh,
  onToggleFavorite,
  onAddressChange,
  onAddressSubmit,
  onNavigate,
  onOpenSearch,
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
  focusAddressBar,
}: ToolbarProps) {
  const { tick, trigger } = useRefreshAnimation(onRefresh);
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const viewMenu = useToolbarMenu(viewButtonRef);
  const newMenu = useToolbarMenu(newButtonRef);

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-surface-container-highest bg-surface-container-low p-2">
      <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-surface-container-highest">
        <button className={groupButtonClass} onClick={onBack} disabled={!canGoBack} title="Back" aria-label="Back">
          <ArrowLeft {...iconProps} />
        </button>
        <div className="h-5 w-px bg-surface-container-highest" />
        <button
          className={groupButtonClass}
          onClick={onForward}
          disabled={!canGoForward}
          title="Forward"
          aria-label="Forward"
        >
          <ArrowRight {...iconProps} />
        </button>
        <div className="h-5 w-px bg-surface-container-highest" />
        <button className={groupButtonClass} onClick={onUp} disabled={!canGoUp} title="Up" aria-label="Up one level">
          <ArrowUp {...iconProps} />
        </button>
        <div className="h-5 w-px bg-surface-container-highest" />
        <button className={groupButtonClass} title="Refresh (Ctrl+R)" aria-label="Refresh" onClick={trigger}>
          <RotateCw {...iconProps} key={tick} className="animate-spin-once" />
        </button>
      </div>

      <AddressBar
        currentPath={currentPath}
        isThisPC={isThisPC}
        value={addressInput}
        onChange={onAddressChange}
        onSubmit={onAddressSubmit}
        onNavigate={onNavigate}
        focusRequest={focusAddressBar}
        isCurrentFavorite={isCurrentFavorite}
        onToggleFavorite={onToggleFavorite}
      />

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          className={ghostButtonClass}
          title="Search files and content (Ctrl+F)"
          aria-label="Search files and content"
          onClick={onOpenSearch}
        >
          <Search {...iconProps} />
        </button>

        <button
          className={ghostButtonClass}
          title="Open Terminal"
          aria-label="Open Terminal"
          onClick={onOpenTerminal}
          disabled={isThisPC}
        >
          <TerminalSquare {...iconProps} />
        </button>

        <div className="mx-1 h-5 w-px bg-surface-container-highest" />

        <button
          ref={newButtonRef}
          className={`${ghostButtonClass} ${newMenu.anchor ? "bg-primary-container/15 text-primary" : ""}`}
          title="New folder or file"
          aria-label="New folder or file"
          aria-haspopup="menu"
          aria-expanded={!!newMenu.anchor}
          onClick={newMenu.toggle}
          disabled={isThisPC}
        >
          <Plus {...iconProps} />
        </button>

        <div className="mx-1 h-5 w-px bg-surface-container-highest" />

        <button
          ref={viewButtonRef}
          className={`${ghostButtonClass} ${viewMenu.anchor ? "bg-primary-container/15 text-primary" : ""}`}
          title="View, sort, and group"
          aria-label="View, sort, and group"
          aria-haspopup="menu"
          aria-expanded={!!viewMenu.anchor}
          onClick={viewMenu.toggle}
        >
          <LayoutGrid {...iconProps} />
        </button>
      </div>

      {newMenu.anchor && (
        <div ref={newMenu.menuRef}>
          <NewMenu x={newMenu.anchor.x} y={newMenu.anchor.y} onNewFolder={onNewFolder} onNewFile={onNewFile} onDismiss={newMenu.close} />
        </div>
      )}

      {viewMenu.anchor && (
        <div ref={viewMenu.menuRef}>
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
    </div>
  );
}
