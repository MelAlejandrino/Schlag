import { useFileExplorerStore } from "../store/file-explorer.store";
import { useDragResize } from "./useDragResize";

// ponytail: same not-yet-configurable-ceiling treatment as useSidebarResize.
const MIN_WIDTH = 240;
const MAX_WIDTH = 600;

export function usePreviewResize() {
  const width = useFileExplorerStore((s) => s.previewWidth);
  const setPreviewWidth = useFileExplorerStore((s) => s.setPreviewWidth);
  const drag = useDragResize({ width, onWidthChange: setPreviewWidth, min: MIN_WIDTH, max: MAX_WIDTH, anchor: "right" });
  return { width, ...drag };
}
