import { ExternalLink, Info, SquarePlus, Star } from "lucide-react";
import { usePopoverPosition } from "../lib/usePopoverPosition";

interface SidebarContextMenuProps {
  x: number;
  y: number;
  isFavorite: boolean;
  onOpen: () => void;
  onOpenInNewTab: () => void;
  onToggleFavorite: () => void;
  onProperties: () => void;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high";

const itemClass = `flex items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface transition-colors duration-150 hover:bg-surface-container-highest ${focusRing}`;

const iconProps = { size: 15, strokeWidth: 1.75 };

// A real folder shortcut (Quick Access/Drives/Favorites), not a full
// EntryTable-style menu — Rename/Copy/Cut/Delete don't map cleanly onto "the
// sidebar's own shortcut to a folder" the way they do onto an actual row, so
// this stays a small, separate menu rather than forcing ContextMenu.tsx to
// grow a third content shape (mirrors ViewMenu.tsx's own precedent for not
// sharing a popover component across dissimilar item sets).
export function SidebarContextMenu({ x, y, isFavorite, onOpen, onOpenInNewTab, onToggleFavorite, onProperties }: SidebarContextMenuProps) {
  const { ref, pos } = usePopoverPosition(x, y);

  return (
    <div
      ref={ref}
      className="animate-menu-in fixed z-[70] flex min-w-44 flex-col gap-0.5 rounded-lg border border-surface-container-highest bg-surface-container-high p-1 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      <button className={itemClass} onClick={onOpen}>
        <ExternalLink {...iconProps} />
        Open
      </button>
      <button className={itemClass} onClick={onOpenInNewTab}>
        <SquarePlus {...iconProps} />
        Open in new tab
      </button>
      <div className="my-0.5 border-t border-surface-container-highest" />
      <button className={itemClass} onClick={onToggleFavorite}>
        <Star {...iconProps} fill={isFavorite ? "currentColor" : "none"} />
        {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
      </button>
      <button className={itemClass} onClick={onProperties}>
        <Info {...iconProps} />
        Properties
      </button>
    </div>
  );
}
