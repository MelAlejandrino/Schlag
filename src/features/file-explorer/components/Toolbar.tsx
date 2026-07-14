import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FilePlus,
  FolderPlus,
  LayoutGrid,
  PanelRight,
  PanelRightClose,
  RotateCw,
  Search,
  Star,
} from "lucide-react";
import { AddressBar } from "./AddressBar";
import { ViewMenu } from "./ViewMenu";
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
  onNewFolder: () => void;
  onNewFile: () => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
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

const buttonClass = `flex items-center justify-center rounded-lg border border-surface-container-highest bg-surface-container px-2.5 py-1.5 text-on-surface transition-colors duration-150 hover:border-primary-container disabled:cursor-default disabled:opacity-40 disabled:hover:border-surface-container-highest ${focusRing}`;

const groupButtonClass = `flex items-center justify-center bg-surface-container px-2.5 py-1.5 text-on-surface transition-colors duration-150 hover:bg-surface-container-high disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface-container ${focusRing}`;

const iconProps = { size: 16, strokeWidth: 1.75 };

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
  onNewFolder,
  onNewFile,
  previewOpen,
  onTogglePreview,
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
  const [viewMenuAnchor, setViewMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  // Same self-contained "own the anchor state and its own click-outside
  // close effect" pattern SearchModal already uses for its result context
  // menu — but unlike that one (opened via "contextmenu", closed via
  // "click", two different event types that can never collide), this menu
  // is opened AND closed via "click". Confirmed live: without the target
  // check below, the button's own opening click was also caught by this
  // same-tick "click" listener on window, closing the menu the instant it
  // opened. Ignoring clicks that land on the trigger button itself (its own
  // onClick already handles toggling) fixes it.
  useEffect(() => {
    if (!viewMenuAnchor) return;
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (viewButtonRef.current?.contains(e.target as Node)) return;
      setViewMenuAnchor(null);
    };
    const closeOnResize = () => setViewMenuAnchor(null);
    window.addEventListener("click", closeOnOutsideClick);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("click", closeOnOutsideClick);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [viewMenuAnchor]);

  function toggleViewMenu() {
    if (viewMenuAnchor) {
      setViewMenuAnchor(null);
      return;
    }
    const rect = viewButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setViewMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
  }

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-surface-container-highest bg-surface-container-low p-2">
      <div className="flex items-center overflow-hidden rounded-lg border border-surface-container-highest">
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
      </div>

      <button className={buttonClass} title="Refresh" aria-label="Refresh" onClick={trigger}>
        <RotateCw {...iconProps} key={tick} className="animate-spin-once" />
      </button>

      <button
        className={`${buttonClass} ${isCurrentFavorite ? "border-tertiary-container text-tertiary" : ""}`}
        title={isCurrentFavorite ? "Unstar this folder" : "Star this folder"}
        aria-label={isCurrentFavorite ? "Unstar this folder" : "Star this folder"}
        onClick={onToggleFavorite}
        disabled={isThisPC}
      >
        <Star {...iconProps} fill={isCurrentFavorite ? "currentColor" : "none"} />
      </button>

      <AddressBar
        currentPath={currentPath}
        isThisPC={isThisPC}
        value={addressInput}
        onChange={onAddressChange}
        onSubmit={onAddressSubmit}
        onNavigate={onNavigate}
        focusRequest={focusAddressBar}
      />

      <button className={buttonClass} title="Search (click to open)" aria-label="Search" onClick={onOpenSearch}>
        <Search {...iconProps} />
      </button>

      <div className="flex items-center overflow-hidden rounded-lg border border-surface-container-highest">
        <button
          className={groupButtonClass}
          title="New folder"
          aria-label="New folder"
          onClick={onNewFolder}
          disabled={isThisPC}
        >
          <FolderPlus {...iconProps} />
        </button>
        <div className="h-5 w-px bg-surface-container-highest" />
        <button
          className={groupButtonClass}
          title="New file"
          aria-label="New file"
          onClick={onNewFile}
          disabled={isThisPC}
        >
          <FilePlus {...iconProps} />
        </button>
      </div>

      <div className="flex items-center overflow-hidden rounded-lg border border-surface-container-highest">
        <button
          className={`${groupButtonClass} ${previewOpen ? "text-primary" : ""}`}
          title={previewOpen ? "Hide preview pane" : "Show preview pane"}
          aria-label={previewOpen ? "Hide preview pane" : "Show preview pane"}
          onClick={onTogglePreview}
        >
          {previewOpen ? <PanelRightClose {...iconProps} /> : <PanelRight {...iconProps} />}
        </button>
        <div className="h-5 w-px bg-surface-container-highest" />
        <button
          ref={viewButtonRef}
          className={`${groupButtonClass} ${viewMenuAnchor ? "text-primary" : ""}`}
          title="View, sort, and group"
          aria-label="View, sort, and group"
          aria-haspopup="menu"
          aria-expanded={!!viewMenuAnchor}
          onClick={toggleViewMenu}
        >
          <LayoutGrid {...iconProps} />
        </button>
      </div>

      {viewMenuAnchor && (
        <ViewMenu
          x={viewMenuAnchor.x}
          y={viewMenuAnchor.y}
          onDismiss={() => setViewMenuAnchor(null)}
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
      )}
    </div>
  );
}
