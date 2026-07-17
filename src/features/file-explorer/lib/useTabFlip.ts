import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

// FLIP (First-Last-Invert-Play) sliding for the tab strip: when tabs change
// order (a live drag-reorder) or one closes and the rest shift, each tab
// animates from where it *was* to where it now *is*, instead of jumping.
//
// Returns a `register(id)` ref-callback for each tab's root element. The
// layout effect runs after every render: it measures each element's true
// layout position (clearing any in-flight transform first so a fast, still-
// animating reorder re-bases cleanly), then for any tab whose position moved
// it sets an inverting transform and animates it back to zero on the next
// frame.
//
// The tab currently being dragged is skipped — it should snap straight to its
// new slot under the cursor while the others slide around it, matching how
// Chrome/VS Code reorder tabs. ponytail: measures viewport-relative left, so
// an autoscroll of the overflow-x strip mid-drag can cause a spurious slide;
// not worth tracking scroll offset for the tab counts in play here.
export function useTabFlip(draggedIdRef: RefObject<string | null>) {
  const els = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const map = els.current;
    // Zero any leftover transform so getBoundingClientRect reports the real
    // layout position, not a mid-animation one.
    map.forEach((el) => {
      el.style.transition = "none";
      el.style.transform = "none";
    });

    const now = new Map<string, number>();
    map.forEach((el, id) => now.set(id, el.getBoundingClientRect().left));

    const moved: HTMLElement[] = [];
    map.forEach((el, id) => {
      const before = prev.current.get(id);
      const after = now.get(id)!;
      if (before !== undefined && before !== after && id !== draggedIdRef.current) {
        el.style.transform = `translateX(${before - after}px)`;
        moved.push(el);
      }
    });
    prev.current = now;

    // Restore class-driven transitions on the tabs we didn't move (we only
    // zeroed them to measure).
    map.forEach((el) => {
      if (!moved.includes(el)) el.style.transition = "";
    });

    if (moved.length === 0) return;
    requestAnimationFrame(() => {
      moved.forEach((el) => {
        el.style.transition = "transform 180ms cubic-bezier(0.34, 1.4, 0.5, 1)";
        el.style.transform = "none";
        const done = () => {
          // Hand control back to the element's own class-based transitions.
          el.style.transition = "";
          el.style.transform = "";
          el.removeEventListener("transitionend", done);
        };
        el.addEventListener("transitionend", done);
      });
    });
  });

  return useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) els.current.set(id, el);
      else els.current.delete(id);
    },
    [],
  );
}
