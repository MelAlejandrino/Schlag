import { useFileExplorerStore } from "../store/file-explorer.store";
import { useDragResize } from "./useDragResize";

// ponytail: arbitrary but reasonable ceilings, not user-configurable yet —
// revisit as a Settings field in Phase 6 if 420px ever feels cramped.
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;

export function useSidebarResize() {
  const width = useFileExplorerStore((s) => s.sidebarWidth);
  const setSidebarWidth = useFileExplorerStore((s) => s.setSidebarWidth);
  const drag = useDragResize({ width, onWidthChange: setSidebarWidth, min: MIN_WIDTH, max: MAX_WIDTH, anchor: "left" });
  return { width, ...drag };
}
