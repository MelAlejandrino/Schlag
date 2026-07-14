import { Copy, Minus, Square, X } from "lucide-react";
import { useWindowControls } from "../lib/useWindowControls";

// Windows control order/placement (minimize, maximize/restore, close, at the
// top-right corner) — this is a Windows-only desktop app (see CLAUDE.md), so
// there's no need to reorder for macOS's left-side traffic lights.
const controlClass =
  "flex w-11 items-center justify-center text-outline transition-colors duration-150 hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-container";

export function WindowControls() {
  const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();

  return (
    <div className="flex shrink-0 items-stretch">
      <button type="button" className={controlClass} title="Minimize" aria-label="Minimize" onClick={minimize}>
        <Minus size={15} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={controlClass}
        title={isMaximized ? "Restore" : "Maximize"}
        aria-label={isMaximized ? "Restore" : "Maximize"}
        onClick={toggleMaximize}
      >
        {/* Two overlapping squares (Copy) is the closest lucide glyph to
            Windows' own "restore down" icon; a single square is maximize. */}
        {isMaximized ? <Copy size={13} strokeWidth={1.75} /> : <Square size={13} strokeWidth={1.75} />}
      </button>
      {/* Same destructive-red pairing ContextMenu's Delete uses, rather than
          a new red — dark-red container with light text, closer to Windows'
          own close-hover than the theme's light `error` foreground color. */}
      <button
        type="button"
        className={`${controlClass} hover:!bg-error-container hover:!text-on-error-container`}
        title="Close"
        aria-label="Close"
        onClick={close}
      >
        <X size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
