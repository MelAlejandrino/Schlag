import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { TerminalSquare, X } from "lucide-react";
import { useTerminalSession } from "../lib/useTerminalSession";
import { useFileExplorerStore } from "../store/file-explorer.store";

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;

// Drag-resize for this panel's top edge — its own small pointer-capture
// mechanics rather than reusing useDragResize (Sidebar's own hook), which is
// hardcoded to a horizontal/width drag with a col-resize cursor. This is the
// only vertical/height resize handle in the app; not worth generalizing a
// shared hook for a single call site.
function useTerminalDragResize() {
  const height = useFileExplorerStore((s) => s.terminalHeight);
  const setHeight = useFileExplorerStore((s) => s.setTerminalHeight);
  const [isResizing, setIsResizing] = useState(false);
  const start = useRef({ y: 0, height: 0 });

  useEffect(() => {
    if (!isResizing) return;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isResizing]);

  function onResizeStart(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, height };
    setIsResizing(true);
  }

  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isResizing) return;
    // Dragging the top edge upward (clientY decreases) grows the panel.
    const delta = start.current.y - e.clientY;
    setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, start.current.height + delta)));
  }

  function onResizeEnd(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsResizing(false);
  }

  return { height, onResizeStart, onResizeMove, onResizeEnd };
}

// The bottom-docked in-app terminal — a real PTY (src-tauri/src/terminal.rs,
// PowerShell over portable-pty) rendered through xterm.js, not a shell-out to
// an external terminal app. The actual PTY/xterm lifecycle lives in
// useTerminalSession (lib/) — this component only owns layout and the
// resize handle, staying presentation-only like everything else in this
// feature.
export function TerminalPanel() {
  const cwd = useFileExplorerStore((s) => s.terminalCwd);
  const closeTerminal = useFileExplorerStore((s) => s.closeTerminal);
  const resize = useTerminalDragResize();
  const { containerRef } = useTerminalSession(cwd, closeTerminal);

  return (
    <div
      className="relative z-20 flex shrink-0 flex-col border-t border-surface-container-highest bg-surface-container-lowest"
      style={{ height: resize.height }}
    >
      <div
        className="absolute -top-1 right-0 left-0 h-2 cursor-row-resize"
        onPointerDown={resize.onResizeStart}
        onPointerMove={resize.onResizeMove}
        onPointerUp={resize.onResizeEnd}
      />
      <div className="flex shrink-0 items-center gap-2 border-b border-surface-container-highest px-3 py-1.5">
        <TerminalSquare size={14} strokeWidth={1.75} className="text-on-surface-variant" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-on-surface-variant">{cwd}</span>
        <button
          onClick={closeTerminal}
          className="rounded p-0.5 text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container"
          title="Close terminal"
          aria-label="Close terminal"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden px-2 py-1" />
    </div>
  );
}
