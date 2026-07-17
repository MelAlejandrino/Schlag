import type { DragEvent } from "react";

const DND_MIME = "application/x-schlag-paths";
// A distinct MIME so TabBar can tell "a file is being dragged onto a tab"
// (DND_MIME) apart from "a tab is being dragged to reorder" (this one) —
// the two need different handling on the same drop target (a tab is both).
const TAB_DND_MIME = "application/x-schlag-tab-id";

export function startDrag(e: DragEvent, paths: string[]) {
  // Nuke the browser's auto-populated drag data first. A row contains an
  // <img> file-type icon, so the browser stuffs that SVG's URL into
  // text/uri-list + text/html — which is all an external app (Chrome, and
  // thus Google Drive) sees, since it doesn't understand DND_MIME. Dropping
  // out therefore "uploaded" the icon SVG instead of the file. We can't hand
  // a real OS file to another app from the webview, so clear it: an external
  // drop now yields nothing rather than a bogus SVG. In-app drops read
  // DND_MIME and are unaffected.
  e.dataTransfer.clearData();
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
