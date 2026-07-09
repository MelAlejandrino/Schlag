import type { Entry } from "../file-explorer.types";
import { entryTypeLabel } from "./entryType";
import type { SortDirection } from "./sortEntries";

export type GroupBy = "none" | "type" | "modified" | "size";

const DAY_MS = 86_400_000;
const MB = 1024 * 1024;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// A simplified version of Explorer's own more elaborate date tiering (which
// further splits "Last week", "Earlier this year", etc.) — a reasonable v1
// ceiling. Both timestamps are floored to midnight first, so the difference
// is an exact multiple of a day — no floating-point boundary surprises.
function dateBucket(modifiedMs: number, nowMs: number): string {
  const daysAgo = Math.round((startOfDay(nowMs) - startOfDay(modifiedMs)) / DAY_MS);
  if (daysAgo <= 0) return "Today"; // <=0 also covers a modified timestamp slightly in the future
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return "This Week";
  if (daysAgo < 30) return "This Month";
  return "Earlier";
}

// Simplified from Explorer's finer Tiny/Small/Medium/Large/Huge/Gigantic
// tiering — same reasonable-v1-ceiling tradeoff as the date buckets above.
function sizeBucket(size: number): string {
  if (size === 0) return "Empty";
  if (size < MB) return "Small";
  if (size < 100 * MB) return "Medium";
  return "Large";
}

// The bucket string doubles as its own display label in every case here
// (e.g. "Today", "Small", "PNG") — no separate label-lookup step needed.
export function groupKeyFor(entry: Entry, groupBy: GroupBy, nowMs: number = Date.now()): string {
  switch (groupBy) {
    case "none":
      return "";
    case "type":
      return entryTypeLabel(entry);
    case "modified":
      return dateBucket(entry.modified_ms, nowMs);
    case "size":
      // Folder sizes aren't meaningfully tracked (see format.ts's
      // formatSize, which shows "" for a directory) — grouping every folder
      // into "Empty" alongside genuinely empty files would be misleading.
      return entry.is_dir ? "Folder" : sizeBucket(entry.size);
  }
}

// "Today"/"Yesterday"/"This Week"/... and "Empty"/"Small"/"Medium"/"Large"
// don't sort into the right order alphabetically — a naive string compare
// would put "Earlier" before "Today". Fixed priority lists instead; "type"
// grouping has no such list and falls back to alphabetical, which IS the
// correct order for extension labels (matches Explorer's own group-by-type).
const MODIFIED_ORDER = ["Today", "Yesterday", "This Week", "This Month", "Earlier"];
const SIZE_ORDER = ["Empty", "Small", "Medium", "Large", "Folder"];

function groupOrderIndex(key: string, order: string[]): number {
  const idx = order.indexOf(key);
  return idx === -1 ? order.length : idx;
}

// Compares two already-computed group keys (from groupKeyFor) into the
// correct group *display* order — used by the store's stable group-sort,
// not by toDisplayItems, which just walks an already-ordered array.
// `groupOrder` is deliberately separate from the sort direction applied
// *within* each group — flipping "sort by date modified" to descending
// shouldn't also silently flip which group (e.g. "Today" vs "Earlier")
// appears first; those are two different questions with two different
// answers, per explicit feedback that conflating them "wasn't normal."
export function compareGroupKeys(a: string, b: string, groupBy: GroupBy, groupOrder: SortDirection = "asc"): number {
  const sign = groupOrder === "asc" ? 1 : -1;
  if (groupBy === "modified") return sign * (groupOrderIndex(a, MODIFIED_ORDER) - groupOrderIndex(b, MODIFIED_ORDER));
  if (groupBy === "size") return sign * (groupOrderIndex(a, SIZE_ORDER) - groupOrderIndex(b, SIZE_ORDER));
  return sign * a.localeCompare(b);
}

export type DisplayItem = { kind: "header"; label: string } | { kind: "entry"; entry: Entry };

// Assumes entries are already ordered so same-group entries are contiguous
// (guaranteed by the store's organizeEntries) — this only needs to notice
// when the group key changes from the previous entry, not build a nested
// group tree.
export function toDisplayItems(entries: Entry[], groupBy: GroupBy, nowMs: number = Date.now()): DisplayItem[] {
  if (groupBy === "none") {
    return entries.map((entry) => ({ kind: "entry", entry }));
  }
  const items: DisplayItem[] = [];
  let lastKey: string | null = null;
  for (const entry of entries) {
    const key = groupKeyFor(entry, groupBy, nowMs);
    if (key !== lastKey) {
      items.push({ kind: "header", label: key });
      lastKey = key;
    }
    items.push({ kind: "entry", entry });
  }
  return items;
}
