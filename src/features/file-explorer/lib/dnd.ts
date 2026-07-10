import type { DragEvent } from "react";

const DND_MIME = "application/x-schlag-paths";
// A distinct MIME so TabBar can tell "a file is being dragged onto a tab"
// (DND_MIME) apart from "a tab is being dragged to reorder" (this one) —
// the two need different handling on the same drop target (a tab is both).
const TAB_DND_MIME = "application/x-schlag-tab-id";

export function startDrag(e: DragEvent, paths: string[]) {
  e.dataTransfer.setData(DND_MIME, JSON.stringify(paths));
  e.dataTransfer.effectAllowed = "copyMove";
}

export function readDrag(e: DragEvent): string[] {
  try {
    const raw = e.dataTransfer.getData(DND_MIME);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// `types` (unlike `getData`, which is blocked during dragover for security)
// is readable throughout the drag — TabBar uses this to tell a tab-reorder
// drag apart from a file-onto-tab drag on the same drop target. The dragged
// tab's actual id can't come from here mid-drag (getData is empty until
// drop), so TabBar tracks it in a ref instead; this just answers "is the
// thing being dragged a tab?".
export function isTabDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(TAB_DND_MIME);
}

export function startTabDrag(e: DragEvent, tabId: string) {
  e.dataTransfer.setData(TAB_DND_MIME, tabId);
  e.dataTransfer.effectAllowed = "move";
}
