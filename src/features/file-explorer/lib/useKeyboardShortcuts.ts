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
  onTogglePreview: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
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

      // Never fire when a modal is open — each modal has its own Escape/Enter.
      const { activePrompt, deleteConfirmOpen } = useFileExplorerStore.getState();
      const { isOpen: searchOpen } = useSearchStore.getState();
      if (activePrompt || deleteConfirmOpen || searchOpen) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "r") {
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
      } else if (ctrl && e.key === "p") {
        e.preventDefault();
        handlers.onTogglePreview();
      } else if (ctrl && e.key === "c") {
        e.preventDefault();
        handlers.onCopy();
      } else if (ctrl && e.key === "x") {
        e.preventDefault();
        handlers.onCut();
      } else if (ctrl && e.key === "v") {
        e.preventDefault();
        handlers.onPaste();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
