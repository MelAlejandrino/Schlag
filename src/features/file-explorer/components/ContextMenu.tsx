import { useLayoutEffect, useRef, useState } from "react";
import {
  AppWindow,
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
  SquarePlus,
  Star,
  TerminalSquare,
  Trash2,
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
      <button role="menuitem" className={itemClass} onClick={onProperties} disabled={selectedCount !== 1}>
        <Info {...iconProps} />
        Properties
      </button>
    </div>
  );
}
