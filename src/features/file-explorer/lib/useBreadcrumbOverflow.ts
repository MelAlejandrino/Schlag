import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pathSegments } from "./path";

// Rough per-segment overhead (the "›" separator + its gaps) not captured by
// measuring bare label widths — close enough for an overflow heuristic.
const SEPARATOR_WIDTH = 20;

// Measures the rendered breadcrumb segments against available width and
// collapses leading (oldest-ancestor) segments behind an ellipsis once they
// no longer fit, keeping the segment(s) closest to the current folder visible.
export function useBreadcrumbOverflow(path: string) {
  const segments = pathSegments(path);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const ellipsisRef = useRef<HTMLButtonElement>(null);
  const [visibleFrom, setVisibleFrom] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    setShowHidden(false);
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    function recompute() {
      const available = container!.clientWidth;
      const kids = Array.from(measure!.children) as HTMLElement[];
      const widths = kids.slice(0, segments.length).map((el) => el.offsetWidth + SEPARATOR_WIDTH);
      const ellipsisWidth = (kids[segments.length]?.offsetWidth ?? 24) + SEPARATOR_WIDTH;

      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= available) {
        setVisibleFrom(0);
        return;
      }
      let from = 0;
      let used = total + ellipsisWidth - widths[0]; // ellipsis replaces the first hidden segment's separator too
      while (from < segments.length - 1 && used > available) {
        from++;
        used -= widths[from - 1] ?? 0;
      }
      setVisibleFrom(from);
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [path, segments.length]);

  useEffect(() => {
    if (!showHidden) return;
    const close = () => setShowHidden(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showHidden]);

  function toggleDropdown() {
    const rect = ellipsisRef.current?.getBoundingClientRect();
    if (rect) setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    setShowHidden((v) => !v);
  }

  function closeDropdown() {
    setShowHidden(false);
  }

  return {
    containerRef,
    measureRef,
    ellipsisRef,
    segments,
    hidden: segments.slice(0, visibleFrom),
    visible: segments.slice(visibleFrom),
    showHidden,
    dropdownPos,
    toggleDropdown,
    closeDropdown,
  };
}
