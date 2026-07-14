import { useCallback, useEffect, useRef } from "react";
import { useFileExplorerStore } from "../store/file-explorer.store";
import type { Entry } from "../file-explorer.types";

const TYPEAHEAD_TIMEOUT_MS = 500;

// Matches EntryGrid's local Row type — a header is a label-only row, a
// tiles row holds up to `columns` entries. Passed in from EntryGrid so
// ArrowUp/Down can skip header rows instead of assuming every row has
// `columns` entries.
export interface GridRow {
  kind: "header" | "tiles";
  entries?: Entry[];
}

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
  // Ref to a virtualizer-aware scroll function — the default
  // scrollIntoView can't reach off-screen virtualized tiles. Using a
  // ref avoids the hook needing to be called after the virtualizer is
  // created (EntryGrid computes it after the hook call).
  scrollToEntryRef?: React.RefObject<((path: string) => void) | null>;
  // EntryGrid passes its rows so ArrowUp/Down can skip header rows
  // when grouping is active.
  gridRows?: GridRow[];
  // Shift+F10 / the keyboard "Menu" key — opens the same context menu a
  // right-click would, at the focused entry's own position. Without this,
  // "Open with…", "Properties", "Open in new tab", and "Open file location"
  // were unreachable without a mouse (confirmed by audit — right-click was
  // the only trigger anywhere in the app).
  onContextMenu?: (entry: Entry, x: number, y: number) => void;
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
  scrollToEntryRef,
  gridRows,
  onContextMenu,
}: EntryKeyboardOptions) {
  const typeaheadRef = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the focused index synchronously — avoids the stale-closure
  // problem where selectedPaths hasn't re-rendered yet between rapid
  // keydown events, causing arrow keys to jump or skip.
  const focusedRef = useRef(-1);

  // Refs for the latest values — the onKeyDown callback reads these
  // instead of the closure-captured props so it always sees the current
  // entries/columns even if a re-render hasn't flushed yet (e.g. a
  // quick keypress right after a folder change or resize).
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const gridRowsRef = useRef(gridRows);
  gridRowsRef.current = gridRows;
  const onContextMenuRef = useRef(onContextMenu);
  onContextMenuRef.current = onContextMenu;

  // Keep focusedRef in sync with the actual selection — when the user
  // clicks a row (or a programmatic selectOnly lands), update the ref
  // so the next arrow-key press starts from the right place.
  useEffect(() => {
    if (selectedPaths.length === 0) {
      focusedRef.current = -1;
      return;
    }
    const last = selectedPaths[selectedPaths.length - 1];
    const idx = entriesRef.current.findIndex((e) => e.path === last);
    if (idx !== -1) focusedRef.current = idx;
  }, [selectedPaths, entries]);

  // When columns change (window resize / sidebar drag), adjust
  // focusedRef so the focused entry stays in the same visual row.
  // Without this, ArrowUp/Down calculate idx±newColumns from a position
  // that was correct for the old layout, landing on the wrong column.
  const prevColumnsRef = useRef(columns);
  useEffect(() => {
    if (prevColumnsRef.current !== columns && focusedRef.current !== -1) {
      const row = Math.floor(focusedRef.current / prevColumnsRef.current);
      const col = focusedRef.current % prevColumnsRef.current;
      const maxCol = columns - 1;
      const newCol = Math.min(col, maxCol);
      focusedRef.current = row * columns + newCol;
    }
    prevColumnsRef.current = columns;
  }, [columns]);

  // Synchronous focus update — called by EntryGrid/EntryTable when the
  // user clicks a tile/row, so focusedRef is current before any
  // subsequent keydown fires (the useEffect that syncs via
  // selectedPaths runs post-render, too late for an immediate keypress).
  const focusIndex = useCallback((index: number) => {
    focusedRef.current = index;
  }, []);

  // Scroll an entry into view. Uses the virtualizer-aware callback
  // when available (EntryGrid), falling back to plain scrollIntoView
  // (EntryTable — all rows are in the DOM, no virtualization).
  const scrollTo = useCallback(
    (index: number) => {
      const ents = entriesRef.current;
      if (index < 0 || index >= ents.length) return;
      const path = ents[index].path;
      // Try the virtualizer-aware scroll first (EntryGrid).
      const virtualScroll = scrollToEntryRef?.current;
      if (virtualScroll) {
        virtualScroll(path);
      } else if (scrollRef?.current) {
        const el = scrollRef.current.querySelector(`[data-entry-path="${CSS.escape(path)}"]`);
        if (el) el.scrollIntoView({ block: "nearest" });
      }
    },
    [scrollRef, scrollToEntryRef],
  );

  // Grid-aware ArrowUp/Down — when gridRows is provided (EntryGrid
  // with grouping), walks the actual rows structure to skip header
  // rows. Without gridRows (EntryTable), falls back to the simple
  // idx ± columns math.
  const moveVertical = useCallback(
    (currentIdx: number, direction: "up" | "down", cols: number): number => {
      const rows = gridRowsRef.current;
      if (!rows || rows.length === 0) {
        // No grid rows — plain columns-based navigation (EntryTable).
        return direction === "down" ? currentIdx + cols : currentIdx - cols;
      }

      // Find which row and column the current entry occupies by
      // walking the rows and counting flat indices.
      let flatIdx = 0;
      let currentRow = -1;
      let currentCol = 0;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (row.kind === "header") continue;
        const rowEntries = row.entries ?? [];
        for (let c = 0; c < rowEntries.length; c++) {
          if (flatIdx === currentIdx) {
            currentRow = r;
            currentCol = c;
            break;
          }
          flatIdx++;
        }
        if (currentRow !== -1) break;
      }

      if (currentRow === -1) return currentIdx;

      // Walk in the requested direction, skipping header rows.
      const step = direction === "down" ? 1 : -1;
      let targetRow = currentRow + step;
      while (targetRow >= 0 && targetRow < rows.length) {
        if (rows[targetRow].kind === "tiles") break;
        targetRow += step;
      }

      if (targetRow < 0 || targetRow >= rows.length) return currentIdx;

      // Compute the flat index of the entry at (targetRow, currentCol).
      let idx = 0;
      for (let r = 0; r < targetRow; r++) {
        if (rows[r].kind === "tiles") {
          idx += (rows[r].entries ?? []).length;
        }
      }
      const targetEntries = rows[targetRow].entries ?? [];
      const col = Math.min(currentCol, targetEntries.length - 1);
      return idx + col;
    },
    [],
  );

  // Move focus to `index`, update the ref immediately (so the next
  // keydown sees the new position without waiting for React), select
  // the entry, and scroll it into view.
  const jumpTo = useCallback(
    (index: number) => {
      const ents = entriesRef.current;
      if (ents.length === 0) return;
      const clamped = Math.max(0, Math.min(index, ents.length - 1));
      focusedRef.current = clamped;
      onSelectOnly(ents[clamped].path);
      scrollTo(clamped);
    },
    [onSelectOnly, scrollTo],
  );

  const typeAheadJump = useCallback(
    (buffer: string) => {
      const ents = entriesRef.current;
      if (ents.length === 0) return;
      const lower = buffer.toLowerCase();
      // Start from the entry AFTER the current focus so repeated single
      // letters cycle through all matches.
      const start = focusedRef.current + 1;
      for (let i = 0; i < ents.length; i++) {
        const idx = (start + i) % ents.length;
        if (ents[idx].name.toLowerCase().startsWith(lower)) {
          focusedRef.current = idx;
          onSelectOnly(ents[idx].path);
          scrollTo(idx);
          return;
        }
      }
    },
    [onSelectOnly, scrollTo],
  );

  // Opens the same context menu a right-click would, positioned at the
  // focused entry's own row — the keyboard equivalent of a right-click
  // (Shift+F10 / the "Menu" key, matching every native Windows app). The
  // focused row is assumed to already be scrolled into view (the same
  // scrollTo() every other navigation action already calls), so it's
  // safe to look it up in the DOM even in a virtualized list.
  const openContextMenuAtFocus = useCallback(() => {
    const ents = entriesRef.current;
    const idx = focusedRef.current;
    if (idx < 0 || idx >= ents.length) return;
    const entry = ents[idx];
    const el = scrollRef?.current?.querySelector(`[data-entry-path="${CSS.escape(entry.path)}"]`);
    const rect = el?.getBoundingClientRect();
    const x = rect ? rect.left + 8 : window.innerWidth / 2;
    const y = rect ? rect.bottom : window.innerHeight / 2;
    onContextMenuRef.current?.(entry, x, y);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Read from refs, not the closure — guarantees current values even
      // if the callback was created before a recent re-render.
      const ents = entriesRef.current;
      const cols = columnsRef.current;
      const idx = focusedRef.current;
      const len = ents.length;
      if (len === 0) return;

      const isGrid = cols > 1;

      // Shared type-ahead handler — called from case "a" (plain) and default.
      const doTypeAhead = () => {
        e.preventDefault();
        if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
        const key = e.key.toLowerCase();
        const buffer = typeaheadRef.current;
        // Spamming the same letter (Explorer's own convention) cycles
        // through every match for that one letter instead of building an
        // ever-longer prefix — without this, buffer keeps growing ("s" ->
        // "ss" -> "sss") and stops matching anything after the first
        // repeat, which read as "can't jump by spamming a letter". This
        // also means a fast repeat never has to wait out the timeout: each
        // press is its own single-char search, not an accumulating one.
        const isRepeat = buffer.length > 0 && [...buffer].every((c) => c === key);
        typeaheadRef.current = isRepeat ? key : buffer + key;
        typeAheadJump(typeaheadRef.current);
        typeaheadTimer.current = setTimeout(() => {
          typeaheadRef.current = "";
        }, TYPEAHEAD_TIMEOUT_MS);
      };

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = idx === -1 ? 0 : moveVertical(idx, "down", cols);
          if (e.shiftKey && idx !== -1) {
            onSelectRange(ents[Math.min(Math.max(next, 0), len - 1)].path);
          } else {
            jumpTo(next);
          }
          break;
        }

        case "ArrowUp": {
          e.preventDefault();
          const next = idx === -1 ? len - 1 : moveVertical(idx, "up", cols);
          if (e.shiftKey && idx !== -1) {
            onSelectRange(ents[Math.max(next, 0)].path);
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
          if (idx >= 0) onOpen(ents[idx]);
          break;

        case "Delete":
          e.preventDefault();
          onDelete();
          break;

        case "F2":
          e.preventDefault();
          onRename();
          break;

        case "F10":
          if (e.shiftKey && idx >= 0) {
            e.preventDefault();
            openContextMenuAtFocus();
          }
          break;

        // The actual keyboard "Menu" key most Windows keyboards have,
        // right next to Ctrl — its KeyboardEvent.key value really is the
        // literal string "ContextMenu".
        case "ContextMenu":
          if (idx >= 0) {
            e.preventDefault();
            openContextMenuAtFocus();
          }
          break;

        case "a":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const { selectOnly, toggleSelect } = useFileExplorerStore.getState();
            selectOnly(ents[0].path);
            for (let i = 1; i < len; i++) {
              toggleSelect(ents[i].path);
            }
          } else {
            doTypeAhead();
          }
          break;

        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            doTypeAhead();
          }
          break;
      }
    },
    [jumpTo, onSelectRange, onOpen, onDelete, onRename, typeAheadJump, moveVertical, openContextMenuAtFocus],
  );

  useEffect(() => {
    return () => {
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
    };
  }, []);

  return { onKeyDown, focusIndex };
}
