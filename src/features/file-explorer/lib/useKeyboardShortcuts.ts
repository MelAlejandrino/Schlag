import { useEffect } from "react";
import { useFileExplorerStore } from "../store/file-explorer.store";
import { useSearchStore } from "../store/search.store";

// Returns true when the event target is an element that handles its own
// keyboard input — shortcuts must not fire in that case or they'd interfere
// with typing in the address bar, search modal, rename prompt, etc.
function isTextInput(e: globalThis.KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable;
}

interface ShortcutHandlers {
  onRefresh: () => void;
  onOpenSearch: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onNewTab: () => void;
  onCloseTab: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  onEscape: () => void;
  onFocusAddress: () => void;
  onOpenSettings: () => void;
}

// Global keyboard shortcuts — Ctrl+key combos that work from anywhere in the
// app (unless a text input is focused or a modal is open). Single-letter
// keys and arrow keys are NOT handled here — those belong to EntryTable's
// own keyboard navigation (useEntryKeyboard) so they only fire when the
// listing is the active context.
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      // Never fire inside text inputs — the user is typing.
      if (isTextInput(e)) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Tab / Ctrl+Shift+Tab — switch tabs, always active even
      // when a modal is open (matches browser convention).
      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) handlers.onPrevTab();
        else handlers.onNextTab();
        return;
      }

      // Never fire when a modal is open — each modal has its own Escape/Enter.
      const { activePrompt, deleteConfirmOpen } = useFileExplorerStore.getState();
      const { isOpen: searchOpen } = useSearchStore.getState();
      if (activePrompt || deleteConfirmOpen || searchOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        handlers.onEscape();
      } else if (ctrl && e.key === "r") {
        e.preventDefault();
        handlers.onRefresh();
      } else if (ctrl && e.key === "f") {
        e.preventDefault();
        handlers.onOpenSearch();
      } else if (e.key === "F2") {
        e.preventDefault();
        handlers.onRename();
      } else if (e.key === "Delete") {
        e.preventDefault();
        handlers.onDelete();
      } else if (ctrl && e.key === "d") {
        e.preventDefault();
        handlers.onToggleFavorite();
      } else if (ctrl && e.key === "n") {
        // Ctrl+N — new folder (Shift variant could be new file, but that's
        // non-obvious; keeping it simple for now).
        e.preventDefault();
        handlers.onNewFolder();
      } else if (ctrl && e.key === "c") {
        e.preventDefault();
        handlers.onCopy();
      } else if (ctrl && e.key === "x") {
        e.preventDefault();
        handlers.onCut();
      } else if (ctrl && e.key === "v") {
        e.preventDefault();
        handlers.onPaste();
      } else if (ctrl && e.key === "t") {
        e.preventDefault();
        handlers.onNewTab();
      } else if (ctrl && e.key === "w") {
        e.preventDefault();
        handlers.onCloseTab();
      } else if (ctrl && e.key === "l") {
        e.preventDefault();
        handlers.onFocusAddress();
      } else if (ctrl && e.key === ",") {
        e.preventDefault();
        handlers.onOpenSettings();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
