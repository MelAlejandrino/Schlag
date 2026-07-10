import { useLayoutEffect, useRef, useState } from "react";

// The same measure-then-clamp technique ContextMenu.tsx/ViewMenu.tsx each
// carry their own copy of — extracted here once a second and third new
// consumer (SidebarContextMenu, TabContextMenu) needed the identical
// boilerplate, rather than duplicating it a third and fourth time.
// ContextMenu.tsx/ViewMenu.tsx are left as-is (already working, already
// tested) rather than migrated onto this for its own sake.
export function usePopoverPosition(x: number, y: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: y, left: x });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    setPos({ top, left });
  }, [x, y]);

  return { ref, pos };
}
