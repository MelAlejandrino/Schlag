import { useEffect, useRef } from "react";

let activeId: symbol | null = null;
let activeClose: (() => void) | null = null;

// Only one context menu (entry table/grid, tab bar, sidebar, search result)
// may be open at a time. Each menu already closes itself on a window "click",
// but right-clicking a *different* target to open another menu never fires
// a "click" event (only "contextmenu"), so the previously-open menu never
// saw it and stayed open. This registers whichever menu opens most recently
// as the sole active one, closing any other menu's registration first.
export function useExclusiveMenu(isOpen: boolean, onClose: () => void) {
  const id = useRef(Symbol()).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    if (activeId !== id) activeClose?.();
    activeId = id;
    activeClose = () => closeRef.current();
    return () => {
      if (activeId === id) {
        activeId = null;
        activeClose = null;
      }
    };
  }, [isOpen, id]);
}
