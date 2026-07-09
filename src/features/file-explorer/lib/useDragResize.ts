import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface UseDragResizeOptions {
  width: number;
  onWidthChange: (width: number) => void;
  min: number;
  max: number;
  // Which screen edge the pane is anchored to — flips the sign of the drag
  // delta. A left-anchored pane (Sidebar) grows when its right-edge handle
  // is dragged rightward (+delta); a right-anchored pane (PreviewPane) grows
  // when its left-edge handle is dragged leftward (-delta).
  anchor: "left" | "right";
}

// Pointer capture (rather than window mousemove/mouseup listeners) keeps
// move/up events routed to the handle even if the cursor outruns it
// mid-drag. The browser still renders whatever cursor is under the actual
// mouse position though, so the body-level cursor override below is what
// keeps the col-resize cursor visually consistent for the whole gesture.
export function useDragResize({ width, onWidthChange, min, max, anchor }: UseDragResizeOptions) {
  const [isResizing, setIsResizing] = useState(false);
  const startRef = useRef({ x: 0, width: 0 });

  useEffect(() => {
    if (!isResizing) return;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isResizing]);

  function onResizeStart(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, width };
    setIsResizing(true);
  }

  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isResizing) return;
    const delta = e.clientX - startRef.current.x;
    const signedDelta = anchor === "left" ? delta : -delta;
    onWidthChange(Math.min(max, Math.max(min, startRef.current.width + signedDelta)));
  }

  function onResizeEnd(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsResizing(false);
  }

  return { isResizing, onResizeStart, onResizeMove, onResizeEnd };
}
