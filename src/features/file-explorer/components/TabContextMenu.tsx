import { Copy, X } from "lucide-react";
import { usePopoverPosition } from "../lib/usePopoverPosition";

interface TabContextMenuProps {
  x: number;
  y: number;
  canClose: boolean;
  onClose: () => void;
  onDuplicate: () => void;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high";

const itemClass = `flex items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface transition-colors duration-150 hover:bg-surface-container-highest disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${focusRing}`;

const iconProps = { size: 15, strokeWidth: 1.75 };

export function TabContextMenu({ x, y, canClose, onClose, onDuplicate }: TabContextMenuProps) {
  const { ref, pos } = usePopoverPosition(x, y);

  return (
    <div
      ref={ref}
      className="animate-menu-in fixed z-[70] flex min-w-40 flex-col gap-0.5 rounded-lg border border-surface-container-highest bg-surface-container-high p-1 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      <button className={itemClass} onClick={onDuplicate}>
        <Copy {...iconProps} />
        Duplicate tab
      </button>
      <button
        className={`flex items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface transition-colors duration-150 hover:bg-error-container hover:text-on-error-container disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${focusRing}`}
        onClick={onClose}
        disabled={!canClose}
      >
        <X {...iconProps} />
        Close tab
      </button>
    </div>
  );
}
