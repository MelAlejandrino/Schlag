import type { ReactNode } from "react";
import { ClipboardPaste, Copy, PencilLine, Scissors, Trash2, X } from "lucide-react";

interface EditActionsBarProps {
  selectedCount: number;
  canPaste: boolean;
  hasClipboard: boolean;
  insideZip: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onClearClipboard: () => void;
  onRename: () => void;
  onDelete: () => void;
  // Terminal / New / View cluster, right-aligned. Passed as a node rather than
  // re-threading its ~14 props through this bar (see ListingActions).
  rightSlot?: ReactNode;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-low";

// Full state set: default → hover → active(pressed: firmer fill + quick
// scale-down so a click registers) → disabled (dimmed, no hover/press). Press
// scale is suppressed under prefers-reduced-motion.
const stateBase = `transition duration-150 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-default disabled:opacity-40 disabled:active:scale-100 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant ${focusRing}`;

const labelBtn = `flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface active:bg-surface-container-highest ${stateBase}`;

// Destructive — same bg-error-container/text-on-error-container pairing
// ContextMenu's Delete row and ConfirmModal's Confirm button use.
const dangerBtn = `flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-on-surface-variant hover:bg-error-container hover:text-on-error-container active:bg-error-container active:text-on-error-container ${stateBase}`;

const iconBtn = `flex items-center justify-center rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface active:bg-surface-container-highest ${stateBase}`;

const iconProps = { size: 15, strokeWidth: 1.75 };

// The header's second row: always-present edit actions for the current
// listing. Each reflects whether it can currently apply (Cut/Copy/Delete need
// a selection, Rename needs exactly one, Paste needs a clipboard; all disable
// inside a read-only zip) rather than showing/hiding — a control that vanishes
// as selection changes reads as unstable, and a visible-but-disabled button
// tells the user the capability exists and how to unlock it.
export function EditActionsBar({
  selectedCount,
  canPaste,
  hasClipboard,
  insideZip,
  onCut,
  onCopy,
  onPaste,
  onClearClipboard,
  onRename,
  onDelete,
  rightSlot,
}: EditActionsBarProps) {
  const hasSelection = selectedCount > 0;
  const singleSelection = selectedCount === 1;

  return (
    <div
      role="toolbar"
      aria-label="Edit actions"
      className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-surface-container-highest bg-surface-container-low px-2 py-1"
    >
      <button type="button" className={labelBtn} onClick={onCut} disabled={!hasSelection || insideZip} title="Cut (Ctrl+X)">
        <Scissors {...iconProps} />
        Cut
      </button>
      <button type="button" className={labelBtn} onClick={onCopy} disabled={!hasSelection || insideZip} title="Copy (Ctrl+C)">
        <Copy {...iconProps} />
        Copy
      </button>
      <button type="button" className={labelBtn} onClick={onPaste} disabled={!canPaste} title="Paste (Ctrl+V)">
        <ClipboardPaste {...iconProps} />
        Paste
      </button>
      <button
        type="button"
        className={iconBtn}
        onClick={onClearClipboard}
        disabled={!hasClipboard}
        title="Clear clipboard"
        aria-label="Clear clipboard"
      >
        <X {...iconProps} />
      </button>

      <div className="mx-1 h-5 w-px bg-surface-container-highest" aria-hidden />

      <button
        type="button"
        className={labelBtn}
        onClick={onRename}
        disabled={!singleSelection || insideZip}
        title={singleSelection ? "Rename (F2)" : "Select a single item to rename"}
      >
        <PencilLine {...iconProps} />
        Rename
      </button>
      <button type="button" className={dangerBtn} onClick={onDelete} disabled={!hasSelection || insideZip} title="Delete (Del)">
        <Trash2 {...iconProps} />
        Delete
      </button>

      {rightSlot && <div className="ml-auto flex items-center gap-0.5">{rightSlot}</div>}
    </div>
  );
}
