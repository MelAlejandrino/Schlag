import type { DragEvent } from "react";

const DND_MIME = "application/x-schlag-paths";

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
