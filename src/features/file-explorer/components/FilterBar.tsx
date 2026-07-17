import { useEffect, useRef, useState } from "react";
import { Filter, MoreHorizontal, X } from "lucide-react";

interface FilterBarProps {
  query: string;
  onChange: (query: string) => void;
  matchCount: number;
  totalCount: number;
  currentPath: string;
}

// A floating "filter this folder" control anchored at the bottom-center of the
// listing — a round ellipsis button that morphs open into a rounded input and
// back. Narrows the current view client-side as you type; no modal, no backend
// (distinct from SearchModal, which searches the whole index).
//
// The whole thing is ONE always-mounted container whose width transitions
// between a circle (w-10) and the bar (w-80). Keeping it mounted is what makes
// the *close* animation possible (an unmount would kill any exit transition),
// and the width-grow under overflow-hidden is what makes the bar visibly
// emerge from the button rather than just fade in.
export function FilterBar({ query, onChange, matchCount, totalCount, currentPath }: FilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const active = query.trim().length > 0;
  const expanded = open || active;

  // Focus the input the moment it expands (clicking the ellipsis).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Filtering is scoped to "this folder," so reset + collapse whenever the
  // folder changes — navigate/back/forward/up/tab-switch all mirror into
  // currentPath, so this one dependency catches every case.
  useEffect(() => {
    onChange("");
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  function close() {
    onChange("");
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div
        className={`pointer-events-auto relative flex h-10 items-center overflow-hidden rounded-full border border-surface-container-highest bg-surface-container-high/95 shadow-lg backdrop-blur transition-[width,padding] duration-300 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none ${
          expanded ? "w-80 max-w-[70vw] px-3.5" : "w-10 px-0"
        }`}
      >
        {/* Expanded input row — clipped by the container while collapsed, so it
            wipes into view as the width grows. Fade is delayed on open so it
            appears once there's room, but instant on close. */}
        <div
          className={`flex w-full items-center gap-2 transition-opacity duration-150 ${
            expanded ? "opacity-100 delay-100" : "pointer-events-none opacity-0"
          }`}
        >
          <Filter size={14} strokeWidth={1.75} className={active ? "text-primary" : "text-on-surface-variant"} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              // Collapse when focus leaves and nothing's typed; an active query
              // keeps it expanded via `active`.
              if (!query.trim()) setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // Swallow so the app-level Escape (clear selection / close
                // menus) doesn't also fire.
                e.stopPropagation();
                close();
              }
            }}
            placeholder="Filter items in this folder…"
            aria-label="Filter items in this folder"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-on-surface placeholder:text-outline focus:outline-none"
          />
          {active && (
            <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-on-surface-variant">
              {matchCount} of {totalCount}
            </span>
          )}
          <button
            type="button"
            // onMouseDown + preventDefault so it runs before the input's onBlur
            // and doesn't lose the click to a focus shift.
            onMouseDown={(e) => {
              e.preventDefault();
              close();
            }}
            title="Close filter (Esc)"
            aria-label="Close filter"
            className="shrink-0 rounded-full p-0.5 text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-highest hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Collapsed ellipsis — fills the circle and is the click target that
            opens it; faded out and click-through once expanded. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Filter this folder"
          aria-label="Filter this folder"
          className={`absolute inset-0 flex items-center justify-center text-on-surface-variant transition-opacity duration-150 hover:text-on-surface ${
            expanded ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
