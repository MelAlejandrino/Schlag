import { useEffect } from "react";

// Closes a transient popover/context menu on any window click or resize —
// the identical effect four call sites (context menu, sidebar/tab/recent-file
// menus) each hand-rolled. `onClose` is read fresh on each event, so callers
// can pass an inline arrow without memoizing it.
export function useClickOutsideClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-subscribing only on open/close is intentional; onClose is called fresh each event
  }, [isOpen]);
}
