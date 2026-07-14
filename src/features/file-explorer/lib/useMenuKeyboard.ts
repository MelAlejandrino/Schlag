import { useEffect } from "react";
import type { KeyboardEvent, RefObject } from "react";

// Shared arrow-key/Home/End/Escape navigation for this app's popover menus
// (ContextMenu, SidebarContextMenu, TabContextMenu, ViewMenu) — none of them
// had any role=/onKeyDown before (confirmed by audit), so a right-click menu
// was reachable only by mouse and had no ARIA menu semantics at all. Reads
// `[role="menuitem"]:not(:disabled)` directly from the DOM rather than
// tracking an index in state, since each menu's own item list is static
// JSX (no reordering), so the DOM is already the source of truth.
export function useMenuKeyboard(containerRef: RefObject<HTMLElement | null>, onClose: () => void) {
  // Move focus onto the first item once the menu mounts — a popup menu is
  // expected (ARIA authoring practices) to already contain focus, whether
  // it was opened by mouse or keyboard, so arrow keys work immediately
  // without an extra Tab press.
  useEffect(() => {
    const first = containerRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)');
    first?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: KeyboardEvent) {
    const container = containerRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        items[currentIndex === -1 ? 0 : (currentIndex + 1) % items.length].focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        items[currentIndex === -1 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length].focus();
        break;
      case "Home":
        e.preventDefault();
        items[0].focus();
        break;
      case "End":
        e.preventDefault();
        items[items.length - 1].focus();
        break;
      case "Escape":
        // Stops here rather than also bubbling to the global Escape
        // handler — both would call the same close, harmless but redundant.
        e.preventDefault();
        e.stopPropagation();
        onClose();
        break;
    }
  }

  return { onKeyDown };
}
