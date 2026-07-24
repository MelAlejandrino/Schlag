import { create } from "zustand";
import type { ClipboardOp } from "../file-explorer.types";

// One live copy/move batch. `index`/`count`/`name`/`destDir`/`op` are set by
// the batch runner before each item; `total`/`written` are merged in from the
// backend's throttled "copy-progress" events.
export interface CopyOp {
  id: string;
  index: number; // 0-based position of the current item in the batch
  count: number; // total items in the batch
  name: string; // basename of the item currently being copied
  destDir: string; // folder the batch is being pasted into
  op: ClipboardOp; // "copy" | "cut" — drives the "Copying"/"Moving" label
  total: number; // bytes of the current file (0 until the first event)
  written: number; // bytes copied so far of the current file
  reverting?: boolean; // cancelled — undoing the already-pasted items
  done?: boolean; // finished — shows a "Completed" check before auto-dismiss
}

// Separate store, NOT part of file-explorer.store — copy progress updates
// several times a second, and the file explorer subscribes to its whole
// store with no selector, so routing progress through it re-rendered the
// entire (thousands-of-rows) listing on every event. Only the progress panel
// subscribes here, so those updates stay cheap. Keyed by op_id so concurrent
// batches (paste in one tab while another still copies) each get their own
// bar and their own cancel.
interface CopyProgressState {
  ops: Record<string, CopyOp>;
  // Sets/replaces the per-item context for a batch (called before each item).
  setOp: (op: CopyOp) => void;
  // Merges byte counts from a progress event; a no-op if the op was already
  // removed (a late event after the batch finished/was cancelled).
  applyBytes: (id: string, total: number, written: number) => void;
  // Flips a bar into its "Reverting…" state while a cancelled batch undoes.
  markReverting: (id: string) => void;
  // Flips a bar into its "Completed" state (shown briefly before removal).
  markDone: (id: string) => void;
  remove: (id: string) => void;
}

export const useCopyProgressStore = create<CopyProgressState>((set) => ({
  ops: {},
  setOp: (op) => set((s) => ({ ops: { ...s.ops, [op.id]: op } })),
  applyBytes: (id, total, written) =>
    set((s) => (s.ops[id] ? { ops: { ...s.ops, [id]: { ...s.ops[id], total, written } } } : s)),
  markReverting: (id) =>
    set((s) => (s.ops[id] ? { ops: { ...s.ops, [id]: { ...s.ops[id], reverting: true } } } : s)),
  markDone: (id) =>
    set((s) => (s.ops[id] ? { ops: { ...s.ops, [id]: { ...s.ops[id], done: true } } } : s)),
  remove: (id) =>
    set((s) => {
      if (!s.ops[id]) return s;
      const { [id]: _, ...rest } = s.ops;
      return { ops: rest };
    }),
}));
