import { useState, type DragEvent } from "react";
import { readDrag } from "./dnd";

// onFirstDragOver is optional and unused by every existing caller
// (EntryTable/ThisPCView/Sidebar) — added for TabBar's drag-to-switch-tabs
// behavior (hovering a drag over a background tab should switch to it, the
// same way browser tabs do), without changing isOver's own timing for
// anyone else. Guarded by `!isOver` rather than relying on dragover firing
// exactly once per hover (it fires continuously) — a stale-closure call
// landing before the `isOver` state commits just calls this again
// harmlessly, since the caller's own guard (TabBar starts a timer keyed off
// a ref, not this state) makes a repeat call a no-op.
export function useDropTarget(
  targetPath: string,
  onDrop: (sourcePaths: string[], targetPath: string, isCopy: boolean) => void,
  onFirstDragOver?: () => void,
) {
  const [isOver, setIsOver] = useState(false);

  return {
    isOver,
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      // preventDefault() alone permits the drop, but the cursor still shows
      // "no-drop" unless dropEffect is explicitly set to match our own logic.
      e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? "copy" : "move";
      if (!isOver) onFirstDragOver?.();
      setIsOver(true);
    },
    onDragLeave: () => setIsOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setIsOver(false);
      const paths = readDrag(e);
      if (paths.length > 0) onDrop(paths, targetPath, e.ctrlKey || e.altKey);
    },
  };
}
