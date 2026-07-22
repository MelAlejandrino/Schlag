import { useLayoutEffect, useRef, useState } from "react";
import {
  AppWindow,
  ChevronRight,
  ClipboardPaste,
  Copy,
  ExternalLink,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Info,
  Pencil,
  RotateCw,
  Scissors,
  Search,
  SquarePlus,
  Star,
  Tag,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import { useMenuKeyboard } from "../lib/useMenuKeyboard";
import type { ContextMenuState } from "../file-explorer.types";

interface ContextMenuProps {
  state: ContextMenuState;
  onDismiss: () => void;
  selectedCount: number;
  selectedIsDir: boolean;
  canPaste: boolean;
  isCurrentFavorite: boolean;
  currentPath: string;
  onOpen: () => void;
  onOpenWith: () => void;
  // Optional and omitted by the normal directory-listing context menu —
  // "reveal this entry's parent folder" is only meaningful when the entry
  // might not be in the folder you're currently looking at, which is
  // specifically the search-result case (SearchModal.tsx is the one caller
  // that passes this).
  onOpenLocation?: () => void;
  // Optional the same way onOpenLocation is — folders only (a file has
  // nowhere to "open a tab to"), gated on selectedIsDir below rather than
  // on whether the prop was passed, since every caller that shows this menu
  // for a folder wants it.
  onOpenInNewTab?: () => void;
  // Not optional like onOpenLocation/onOpenInNewTab — one handler covers
  // both the background menu (no selection, targets the current folder) and
  // the per-entry menu (single folder selected), see useFileExplorer.ts's
  // openTerminalContextMenu.
  onOpenTerminal: () => void;
  onRename: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onProperties: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onRefresh: () => void;
  onToggleFavorite: () => void;
  onSearchInFolder?: (path: string) => void;
  selectedPath?: string;
  allTags: { id: number; name: string; color: string }[];
  selectedFileTags: { id: number; name: string; color: string }[];
  onToggleFileTag: (tagId: number) => void;
  onCreateTag: (name: string) => void;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high";

const itemClass = `flex items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface transition-colors duration-150 hover:bg-surface-container-highest disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${focusRing}`;

const iconProps = { size: 15, strokeWidth: 1.75 };

export function ContextMenu({
  state,
  onDismiss,
  selectedCount,
  selectedIsDir,
  canPaste,
  isCurrentFavorite,
  currentPath,
  onOpen,
  onOpenWith,
  onOpenLocation,
  onOpenInNewTab,
  onOpenTerminal,
  onRename,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onProperties,
  onNewFolder,
  onNewFile,
  onRefresh,
  onToggleFavorite,
  onSearchInFolder,
  selectedPath,
  allTags,
  selectedFileTags,
  onToggleFileTag,
  onCreateTag,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: state.y, left: state.x });
  const menuKeyboard = useMenuKeyboard(menuRef, onDismiss);

  // Corrects the position after measuring the menu's actual rendered size,
  // before the browser paints (useLayoutEffect, not useEffect) so there's
  // no visible jump — opening near the bottom/right edge would otherwise
  // clip the menu, since it's placed at the raw click coordinates with no
  // regard for whether it actually fits there.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = Math.max(8, Math.min(state.y, window.innerHeight - rect.height - 8));
    const left = Math.max(8, Math.min(state.x, window.innerWidth - rect.width - 8));
    setPos({ top, left });
  }, [state.x, state.y]);

  // Right-click on empty space (not a row) — folder-level actions instead
  // of per-entry ones, all targeting whatever folder is currently browsed.
  if (state.background) {
    return (
      <div
        ref={menuRef}
        role="menu"
        onKeyDown={menuKeyboard.onKeyDown}
        className="animate-menu-in fixed z-[70] flex min-w-44 flex-col gap-0.5 rounded-lg border border-surface-container-highest bg-surface-container-high p-1 shadow-lg"
        style={{ top: pos.top, left: pos.left }}
      >
        <button role="menuitem" className={itemClass} onClick={onNewFolder}>
          <FolderPlus {...iconProps} />
          New Folder
        </button>
        <button role="menuitem" className={itemClass} onClick={onNewFile}>
          <FilePlus {...iconProps} />
          New File
        </button>
        <div className="my-0.5 border-t border-surface-container-highest" />
        <button role="menuitem" className={itemClass} onClick={onPaste} disabled={!canPaste}>
          <ClipboardPaste {...iconProps} />
          Paste
        </button>
        <div className="my-0.5 border-t border-surface-container-highest" />
        <button role="menuitem" className={itemClass} onClick={onOpenTerminal}>
          <TerminalSquare {...iconProps} />
          Open Terminal
        </button>
        {onSearchInFolder && (
          <>
            <div className="my-0.5 border-t border-surface-container-highest" />
            <button role="menuitem" className={itemClass} onClick={() => onSearchInFolder(currentPath)}>
              <Search {...iconProps} />
              Search in this folder
            </button>
          </>
        )}
        <div className="my-0.5 border-t border-surface-container-highest" />
        <button role="menuitem" className={itemClass} onClick={onToggleFavorite}>
          <Star {...iconProps} fill={isCurrentFavorite ? "currentColor" : "none"} />
          {isCurrentFavorite ? "Remove from Favorites" : "Add to Favorites"}
        </button>
        <button role="menuitem" className={itemClass} onClick={onRefresh}>
          <RotateCw {...iconProps} />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={menuKeyboard.onKeyDown}
      className="animate-menu-in fixed z-[70] flex min-w-40 flex-col gap-0.5 rounded-lg border border-surface-container-highest bg-surface-container-high p-1 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      <button role="menuitem" className={itemClass} onClick={onOpen} disabled={selectedCount !== 1}>
        <ExternalLink {...iconProps} />
        Open
      </button>
      {onOpenInNewTab && selectedIsDir && (
        <button role="menuitem" className={itemClass} onClick={onOpenInNewTab} disabled={selectedCount !== 1}>
          <SquarePlus {...iconProps} />
          Open in new tab
        </button>
      )}
      {onOpenLocation && (
        <button role="menuitem" className={itemClass} onClick={onOpenLocation} disabled={selectedCount !== 1}>
          <FolderOpen {...iconProps} />
          Open file location
        </button>
      )}
      {selectedIsDir && (
        <button role="menuitem" className={itemClass} onClick={onOpenTerminal} disabled={selectedCount !== 1}>
          <TerminalSquare {...iconProps} />
          Open Terminal
        </button>
      )}
      {selectedIsDir && onSearchInFolder && selectedPath && (
        <button role="menuitem" className={itemClass} onClick={() => onSearchInFolder(selectedPath)} disabled={selectedCount !== 1}>
          <Search {...iconProps} />
          Search in this folder
        </button>
      )}
      {!selectedIsDir && (
        <button role="menuitem" className={itemClass} onClick={onOpenWith} disabled={selectedCount !== 1}>
          <AppWindow {...iconProps} />
          Open with...
        </button>
      )}
      <button role="menuitem" className={itemClass} onClick={onRename} disabled={selectedCount !== 1}>
        <Pencil {...iconProps} />
        Rename
      </button>
      <button role="menuitem" className={itemClass} onClick={onCopy}>
        <Copy {...iconProps} />
        Copy
      </button>
      <button role="menuitem" className={itemClass} onClick={onCut}>
        <Scissors {...iconProps} />
        Cut
      </button>
      <button
        role="menuitem"
        className={`flex items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface transition-colors duration-150 hover:bg-error-container hover:text-on-error-container ${focusRing}`}
        onClick={onDelete}
      >
        <Trash2 {...iconProps} />
        Delete{selectedCount > 1 ? ` (${selectedCount})` : ""}
      </button>
      <div className="my-0.5 border-t border-surface-container-highest" />
      {selectedCount === 1 && (
        <>
          <TagMenuItem
            allTags={allTags}
            selectedFileTags={selectedFileTags}
            onToggleFileTag={onToggleFileTag}
            onCreateTag={onCreateTag}
            flipLeft={pos.left > window.innerWidth / 2}
          />
          <div className="my-0.5 border-t border-surface-container-highest" />
        </>
      )}
      <button role="menuitem" className={itemClass} onClick={onProperties} disabled={selectedCount !== 1}>
        <Info {...iconProps} />
        Properties
      </button>
    </div>
  );
}

interface TagMenuItemProps {
  allTags: { id: number; name: string; color: string }[];
  selectedFileTags: { id: number; name: string; color: string }[];
  onToggleFileTag: (tagId: number) => void;
  onCreateTag: (name: string) => void;
  // Open the flyout to the left instead of the right when the menu itself sits
  // in the right half of the screen (cheap heuristic — no submenu measurement).
  flipLeft: boolean;
}

// A "Tags ▸" row that opens a side flyout, rather than flooding the main menu
// with every tag inline. The flyout toggles existing tags on/off and creates
// new ones via an inline input (no native prompt() — this app removed all
// browser dialogs, see CLAUDE.md). stopPropagation everywhere so interacting
// with the flyout doesn't trip the window-click listener that closes the menu.
function TagMenuItem({ allTags, selectedFileTags, onToggleFileTag, onCreateTag, flipLeft }: TagMenuItemProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const flyoutRef = useRef<HTMLDivElement>(null);
  // Shift the flyout up (relative to the Tags row) when anchoring it at the
  // row's top would run it past the bottom of the viewport — the whole thing
  // is short enough (list capped at max-h-48) to always fit once nudged up.
  const [topOffset, setTopOffset] = useState(0);
  const appliedIds = new Set(selectedFileTags.map((t) => t.id));
  const trimmed = value.trim();
  const canCreate = trimmed !== "" && !allTags.some((t) => t.name === trimmed);

  useLayoutEffect(() => {
    if (!open || !flyoutRef.current) return;
    const rect = flyoutRef.current.getBoundingClientRect();
    // rect reflects the current topOffset; back it out to get the true, un-
    // shifted geometry so this stays correct no matter what offset was left
    // over from a previous open.
    const rowTop = rect.top - topOffset;
    const overflow = rowTop + rect.height - (window.innerHeight - 8);
    setTopOffset(overflow > 0 ? -Math.min(overflow, rowTop - 8) : 0);
  }, [open, allTags.length]);

  return (
    <div className="relative">
      <button
        role="menuitem"
        className={itemClass + " w-full justify-between"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <span className="flex items-center gap-2.5">
          <Tag {...iconProps} />
          Tags
          {selectedFileTags.length > 0 && (
            <span className="rounded-full bg-primary-container px-1.5 text-[10px] font-medium text-white">
              {selectedFileTags.length}
            </span>
          )}
        </span>
        <ChevronRight size={14} strokeWidth={1.75} className={open ? "rotate-90 transition-transform" : "transition-transform"} />
      </button>
      {open && (
        <div
          ref={flyoutRef}
          onClick={(e) => e.stopPropagation()}
          style={{ top: topOffset }}
          className={`animate-menu-in absolute z-[71] flex max-h-[calc(100vh-1rem)] w-56 flex-col gap-1.5 rounded-lg border border-surface-container-highest bg-surface-container-high p-2 shadow-lg ${flipLeft ? "right-full mr-1" : "left-full ml-1"}`}
        >
          {allTags.length > 0 ? (
            <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
              {allTags.map((tag) => {
                const on = appliedIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onToggleFileTag(tag.id)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-opacity"
                    style={{
                      backgroundColor: tag.color + (on ? "33" : "1a"),
                      color: tag.color,
                      border: `1px solid ${tag.color}${on ? "55" : "22"}`,
                      opacity: on ? 1 : 0.6,
                    }}
                    title={on ? `Remove "${tag.name}"` : `Add "${tag.name}"`}
                  >
                    {tag.name}
                    {on && <X size={10} strokeWidth={2} />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-[12px] text-outline">No tags yet</div>
          )}
          <input
            autoFocus
            className="w-full rounded border border-surface-container-highest bg-surface-container px-2 py-1 text-[12px] text-on-surface outline-none placeholder:text-outline focus:border-primary"
            placeholder="New tag + Enter…"
            value={value}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && canCreate) {
                e.preventDefault();
                onCreateTag(trimmed);
                setValue("");
              }
            }}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
