import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// A borderless window (decorations: false) has no native resize borders on
// Windows, so we re-add them: thin invisible strips pinned to each edge and
// corner that start an OS-level resize drag on mousedown. Using the OS drag
// loop (not manual pointer math) means native edge-snapping still works, for
// free. Corners come after edges in source order so they stack on top and
// win at the actual corner pixels. `as const` makes each `dir` the exact
// string-literal `ResizeDirection` expects, so it passes with no cast.
const HANDLES = [
  { dir: "North", className: "top-0 right-2 left-2 h-1 cursor-ns-resize" },
  { dir: "South", className: "bottom-0 right-2 left-2 h-1 cursor-ns-resize" },
  { dir: "West", className: "top-2 bottom-2 left-0 w-1 cursor-ew-resize" },
  { dir: "East", className: "top-2 bottom-2 right-0 w-1 cursor-ew-resize" },
  { dir: "NorthWest", className: "top-0 left-0 h-2 w-2 cursor-nwse-resize" },
  { dir: "NorthEast", className: "top-0 right-0 h-2 w-2 cursor-nesw-resize" },
  { dir: "SouthWest", className: "bottom-0 left-0 h-2 w-2 cursor-nesw-resize" },
  { dir: "SouthEast", className: "bottom-0 right-0 h-2 w-2 cursor-nwse-resize" },
] as const;

export function WindowResizeHandles() {
  function onResizeStart(e: MouseEvent, dir: (typeof HANDLES)[number]["dir"]) {
    // Only the primary button starts a resize; ignore right/middle so a
    // right-click near an edge doesn't get swallowed.
    if (e.button !== 0) return;
    e.preventDefault();
    getCurrentWindow().startResizeDragging(dir);
  }

  return (
    <>
      {HANDLES.map((h) => (
        <div
          key={h.dir}
          onMouseDown={(e) => onResizeStart(e, h.dir)}
          className={`fixed z-[100] ${h.className}`}
        />
      ))}
    </>
  );
}
