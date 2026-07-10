import { useCallback, useEffect, useRef } from "react";
import { useFileExplorerStore } from "../store/file-explorer.store";
import type { Entry } from "../file-explorer.types";

const TYPEAHEAD_TIMEOUT_MS = 500;

interface EntryKeyboardOptions {
  entries: Entry[];
  selectedPaths: string[];
  onSelectOnly: (path: string) => void;
  onSelectRange: (path: string) => void;
  onOpen: (entry: Entry) => void;
  onDelete: () => void;
  onRename: () => void;
  columns?: number;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function useEntryKeyboard({
  entries,
  selectedPaths,
  onSelectOnly,
  onSelectRange,
  onOpen,
  onDelete,
  onRename,
  columns = 1,
  scrollRef,
}: EntryKeyboardOptions) {
  const typeaheadRef = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the focused index synchronously — avoids the stale-closure
  // problem where selectedPaths hasn't re-rendered yet between rapid
  // keydown events, causing arrow keys to jump or skip.
  const focusedRef = useRef(-1);

  // Keep focusedRef in sync with the actual selection — when the user
  // clicks a row (or a programmatic selectOnly lands), update the ref
  // so the next arrow-key press starts from the right place.
  useEffect(() => {
    if (selectedPaths.length === 0) {
      focusedRef.current = -1;
      return;
    }
    const last = selectedPaths[selectedPaths.length - 1];
    const idx = entries.findIndex((e) => e.path === last);
    if (idx !== -1) focusedRef.current = idx;
  }, [selectedPaths, entries]);

  const scrollTo = useCallback(
    (index: number) => {
      if (!scrollRef?.current || index < 0 || index >= entries.length) return;
      const path = entries[index].path;
      const el = scrollRef.current.querySelector(`[data-entry-path="${CSS.escape(path)}"]`);
      if (el) el.scrollIntoView({ block: "nearest" });
    },
    [entries, scrollRef],
  );

  // Move focus to `index`, update the ref immediately (so the next
  // keydown sees the new position without waiting for React), select
  // the entry, and scroll it into view.
  const jumpTo = useCallback(
    (index: number) => {
      if (entries.length === 0) return;
      const clamped = Math.max(0, Math.min(index, entries.length - 1));
      focusedRef.current = clamped;
      onSelectOnly(entries[clamped].path);
      scrollTo(clamped);
    },
    [entries, onSelectOnly, scrollTo],
  );

  const typeAheadJump = useCallback(
    (buffer: string) => {
      if (entries.length === 0) return;
      const lower = buffer.toLowerCase();
      // Start from the entry AFTER the current focus so repeated single
      // letters cycle through all matches.
      const start = focusedRef.current + 1;
      for (let i = 0; i < entries.length; i++) {
        const idx = (start + i) % entries.length;
        if (entries[idx].name.toLowerCase().startsWith(lower)) {
          focusedRef.current = idx;
          onSelectOnly(entries[idx].path);
          scrollTo(idx);
          return;
        }
      }
    },
    [entries, onSelectOnly, scrollTo],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const idx = focusedRef.current;
      const len = entries.length;
      if (len === 0) return;

      const isGrid = columns > 1;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = idx === -1 ? 0 : idx + columns;
          if (e.shiftKey && idx !== -1) {
            onSelectRange(entries[Math.min(next, len - 1)].path);
          } else {
            jumpTo(next);
          }
          break;
        }

        case "ArrowUp": {
          e.preventDefault();
          const next = idx === -1 ? len - 1 : idx - columns;
          if (e.shiftKey && idx !== -1) {
            onSelectRange(entries[Math.max(next, 0)].path);
          } else {
            jumpTo(next);
          }
          break;
        }

        case "ArrowLeft":
          if (isGrid) {
            e.preventDefault();
            if (idx > 0) jumpTo(idx - 1);
          }
          break;

        case "ArrowRight":
          if (isGrid) {
            e.preventDefault();
            if (idx < len - 1) jumpTo(idx + 1);
          }
          break;

        case "Home":
          e.preventDefault();
          jumpTo(0);
          break;

        case "End":
          e.preventDefault();
          jumpTo(len - 1);
          break;

        case "Enter":
          e.preventDefault();
          if (idx >= 0) onOpen(entries[idx]);
          break;

        case "Delete":
          e.preventDefault();
          onDelete();
          break;

        case "F2":
          e.preventDefault();
          onRename();
          break;

        case "a":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const { selectOnly, toggleSelect } = useFileExplorerStore.getState();
            selectOnly(entries[0].path);
            for (let i = 1; i < len; i++) {
              toggleSelect(entries[i].path);
            }
          }
          break;

        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
            typeaheadRef.current += e.key;
            typeAheadJump(typeaheadRef.current);
            typeaheadTimer.current = setTimeout(() => {
              typeaheadRef.current = "";
            }, TYPEAHEAD_TIMEOUT_MS);
          }
          break;
      }
    },
    [entries, columns, jumpTo, onSelectRange, onOpen, onDelete, onRename, typeAheadJump],
  );

  useEffect(() => {
    return () => {
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
    };
  }, []);

  return { onKeyDown };
}
