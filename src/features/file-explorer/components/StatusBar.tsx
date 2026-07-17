import { formatSize } from "../lib/format";

interface StatusBarProps {
  itemCount: number;
  selectedCount: number;
  // Bytes across selected files (folders contribute 0 — sizes aren't tracked
  // for directories, same as formatSize's own is_dir handling).
  selectedSize: number;
  totalSize: number;
}

// The window's bottom status strip. Left: item/selection count. Right: the
// folder's total file size. Edit actions live in the header's second row
// (EditActionsBar), not here — the footer is ambient info only.
export function StatusBar({ itemCount, selectedCount, selectedSize, totalSize }: StatusBarProps) {
  const left =
    selectedCount > 0
      ? `${selectedCount} of ${itemCount} selected${selectedSize > 0 ? ` · ${formatSize(selectedSize, false)}` : ""}`
      : `${itemCount} ${itemCount === 1 ? "item" : "items"}`;

  return (
    <div className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-surface-container-highest bg-surface-container-low px-3 text-[11px] text-on-surface-variant">
      <span className="truncate" aria-live="polite">
        {left}
      </span>
      {totalSize > 0 && <span className="shrink-0 tabular-nums text-outline">{formatSize(totalSize, false)}</span>}
    </div>
  );
}
