import { useState, type DragEvent } from "react";
import { readDrag } from "./dnd";

export function useDropTarget(targetPath: string, onDrop: (sourcePaths: string[], targetPath: string, isCopy: boolean) => void) {
  const [isOver, setIsOver] = useState(false);

  return {
    isOver,
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      // preventDefault() alone permits the drop, but the cursor still shows
      // "no-drop" unless dropEffect is explicitly set to match our own logic.
      e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? "copy" : "move";
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
